// Business rules for the CRM -> Ops follow-up handoff.
// Pure functions; the same text is inlined into the n8n Code nodes by build.js.
// All times are IST wall-clock, held as "fake UTC" Dates (read with getUTC*), so host timezone never matters.

const DAY = 86400000;
const IST_MS = 330 * 60000;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OPEN = ['New'];

const ist = (d) => new Date(d.getTime() + IST_MS);
const pad = (n) => String(n).padStart(2, '0');
const fmt = (f) => `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}-${pad(f.getUTCDate())} ${pad(f.getUTCHours())}:${pad(f.getUTCMinutes())}`;
const nice = (f, time) => `${DOW[f.getUTCDay()]} ${f.getUTCDate()} ${MON[f.getUTCMonth()]}` + (time ? ` ${pad(f.getUTCHours())}:${pad(f.getUTCMinutes())}` : '');
// 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM[...]' -> fake-UTC Date, or null
function parseWall(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0))) : null;
}

// Blank everywhere means '', 'NaN', 'N/A' or missing.
function clean(v) {
  const s = v == null ? '' : String(v).trim();
  return ['', 'nan', 'n/a'].includes(s.toLowerCase()) ? '' : s;
}

function toNumber(v) {
  const s = clean(v).replace(/[,₹$]/g, '');
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
}

// The ONLY place that knows your CRM's webhook field names. Capture one real payload from the
// client's CRM (HubSpot, Pipedrive, GoHighLevel, Zoho, ...) and adjust here — this is the one-time
// customization step per client, everything else below is CRM-agnostic.
function fromCrm(body) {
  const b = body || {};
  return {
    leadId: clean(b.id || b.lead_id || b.dealId),
    name: clean(b.name || b.full_name || [clean(b.first_name), clean(b.last_name)].filter(Boolean).join(' ')),
    phone: clean(b.phone),
    email: clean(b.email),
    team: clean(b.team || b.pipeline || b.source),
    dealValue: toNumber(b.deal_value ?? b.amount ?? b.value),
    owner: clean(b.owner || b.owner_name),
    stage: clean(b.stage),
  };
}

function isTrigger(lead, stage) {
  return lead.stage.toLowerCase() === String(stage || '').trim().toLowerCase();
}

// Follow-up due within 1 business day of the lead closing, by 12:00 IST the next business day.
// A lead that closes on a weekend gets a Monday 12:00 slot instead of Saturday/Sunday.
// ponytail: fixed "1 business day" window; make it a Settings value if clients want it tighter/looser.
function followUpDueBy(receivedAt) {
  const r = ist(receivedAt);
  const dow = r.getUTCDay();
  if (dow === 0 || dow === 6) {
    const toMon = dow === 0 ? 1 : 2;
    const mon = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate() + toMon, 12, 0));
    return { dueBy: fmt(mon), flag: 'Closed on a weekend → Monday slot' };
  }
  let d = r.getTime();
  do { d += DAY; } while ([0, 6].includes(new Date(d).getUTCDay()));
  const nd = new Date(d);
  const due = new Date(Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate(), 12, 0));
  return { dueBy: fmt(due), flag: '' };
}

function ownerFor(team, settings) {
  const s = settings || [];
  const reachable = (r) => clean(r.WhatsApp) || clean(r.Email);
  const c = s.find((r) => r.Role === 'Team Owner' && String(r.Team).trim().toLowerCase() === String(team || '').trim().toLowerCase() && reachable(r))
    || s.find((r) => r.Role === 'Fallback Owner' && reachable(r));
  return c ? { Name: c.Name, WhatsApp: clean(c.WhatsApp), Email: clean(c.Email) } : null;
}

const REQUIRED = [['leadId', 'lead id'], ['name', 'lead name'], ['owner', 'sales owner']];

// existing = the Follow-ups row already holding this lead, or null. An update keeps the Status and the first arrival time.
function buildFollowUpTask(lead, receivedAt, settings, existing) {
  const flags = [];
  const missing = REQUIRED.filter(([k]) => !lead[k]).map(([, label]) => label);
  if (missing.length) flags.push('Missing: ' + missing.join(', '));
  const firstReceived = (existing && parseWall(existing['Received at'])) || null;
  const rb = followUpDueBy(firstReceived ? new Date(firstReceived.getTime() - IST_MS) : receivedAt);
  if (rb.flag) flags.push(rb.flag);
  const c = ownerFor(lead.team, settings);
  if (!c) flags.push(`No owner set for team ${lead.team || '?'}`);
  const row = {
    'Received at': (existing && existing['Received at']) || fmt(ist(receivedAt)), 'CRM Lead ID': lead.leadId || `no-id-${receivedAt.getTime()}`,
    Lead: lead.name, Phone: lead.phone, Email: lead.email, Team: lead.team,
    'Deal Value': lead.dealValue == null ? '' : lead.dealValue, Owner: lead.owner,
    'Follow-up due': rb.dueBy, Status: (existing && existing.Status) || 'New', Flags: flags.join('; '),
  };
  const q = (v) => v || '?';
  const due = parseWall(rb.dueBy);
  const when = due ? `Follow up by ${nice(due, true)}.` : 'Follow-up date not set.';
  let text = `New deal closed: ${q(lead.name)}${lead.dealValue != null ? ` (₹${lead.dealValue})` : ''}. ${when} Sales: ${q(lead.owner)}.`;
  if (row.Flags) text = `⚠ ${row.Flags}. ${text}`;
  let subject = `New deal: ${q(lead.name)} – ${due ? `follow up by ${nice(due, true)}` : 'no follow-up date'}`;
  if (row.Flags) subject = `⚠ ${subject}`;
  if (existing) { text = `Updated: ${text}`; subject = `Updated: ${subject}`; }
  return { row, to: (c && c.WhatsApp) || null, email: c ? c.Email : '', subject, text, updated: !!existing };
}

// Weekly agenda for the follow-up review (shared by the text and HTML versions).
function review(rows, now) {
  const n = ist(now);
  const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  const nowStr = fmt(n);
  const open = (rows || []).filter((r) => OPEN.includes(r.Status));
  const days = (r) => Math.floor((n - parseWall(r['Received at'])) / DAY);
  return {
    n,
    dueThisWeek: open.filter((r) => { const d = parseWall(r['Follow-up due']); return d && d >= today && d <= today + 7 * DAY; }),
    overdue: open.filter((r) => r['Follow-up due'] && String(r['Follow-up due']).slice(0, 16) < nowStr),
    noOwner: open.filter((r) => /No owner set/.test(r.Flags || '')),
    oldest: open.filter((r) => parseWall(r['Received at']))
      .sort((a, b) => parseWall(a['Received at']) - parseWall(b['Received at'])).slice(0, 3)
      .map((r) => ({ ...r, days: days(r) })),
  };
}

function weeklySummary(rows, now, sheetUrl) {
  const v = review(rows, now);
  return [
    `Follow-up review – ${nice(v.n)}`,
    `Due this week: ${v.dueThisWeek.length}`,
    `Overdue: ${v.overdue.length}`,
    `No owner set: ${v.noOwner.length}`,
    ...(v.oldest.length ? ['Waiting longest:', ...v.oldest.map((r) => `- ${r.Lead}, ${r.days} days`)] : []),
    `Full list: ${sheetUrl}`,
  ].join('\n');
}

// ---- HTML email (inline styles only: email clients drop <style> blocks) ----
// Every value from the CRM or the Sheet goes through esc(), so a name can't inject markup.
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const niceStr = (s, time) => { const d = parseWall(s); return d ? nice(d, time) : ''; };
const FONT = "font-family:Arial,Helvetica,sans-serif;color:#1f2937;";
function shell(title, colour, body, sheetUrl, footer) {
  return `<div style="${FONT}max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">`
    + `<div style="background:${colour};color:#fff;padding:14px 18px;font-size:18px;font-weight:bold">${title}</div>`
    + `<div style="padding:16px 18px">${body}`
    + `<p style="margin:18px 0 4px"><a href="${esc(sheetUrl)}" style="background:#0f766e;color:#fff;text-decoration:none;padding:9px 14px;border-radius:6px;font-size:14px;display:inline-block">Open Follow-ups</a></p>`
    + `</div><div style="padding:10px 18px;background:#f9fafb;color:#6b7280;font-size:12px">${footer}</div></div>`;
}
const tr = (k, v, strong) => `<tr><td style="padding:6px 10px 6px 0;color:#6b7280;font-size:14px;white-space:nowrap;vertical-align:top">${k}</td>`
  + `<td style="padding:6px 0;font-size:14px;${strong ? 'font-weight:bold;' : ''}">${v || '<span style="color:#b91c1c">not set</span>'}</td></tr>`;

function alertHtml(task, sheetUrl) {
  const r = task.row;
  const banner = r.Flags
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;color:#92400e;padding:10px 12px;margin-bottom:14px;font-size:14px">⚠ ${esc(r.Flags)}</div>` : '';
  const body = banner + `<table style="border-collapse:collapse;width:100%">`
    + tr('Lead', esc(r.Lead), true)
    + tr('Team', esc(r.Team))
    + tr('Deal value', r['Deal Value'] === '' ? '' : esc(`₹${r['Deal Value']}`))
    + tr('Follow-up due', esc(niceStr(r['Follow-up due'], true)), true)
    + tr('Owner', esc(r.Owner))
    + tr('Phone', esc(r.Phone))
    + tr('Email', esc(r.Email))
    + tr('Status', esc(r.Status))
    + `</table>`;
  const title = `${task.updated ? 'Updated: ' : ''}New deal${r.Lead ? ` – ${esc(r.Lead)}` : ''}`;
  return shell(title, r.Flags ? '#b45309' : '#0f766e', body, sheetUrl, 'Sent automatically when the CRM marks a lead Closed Won. Mark the follow-up Contacted in the Follow-ups sheet.');
}

function summaryHtml(rows, now, sheetUrl) {
  const v = review(rows, now);
  const tile = (label, num, colour) => `<td style="padding:4px;width:33%"><div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center">`
    + `<div style="font-size:24px;font-weight:bold;color:${colour}">${num}</div><div style="font-size:12px;color:#6b7280">${label}</div></div></td>`;
  const list = (heading, items, line) => items.length
    ? `<p style="margin:16px 0 6px;font-weight:bold;font-size:14px">${heading}</p><ul style="margin:0;padding-left:18px;font-size:14px">${items.map((r) => `<li style="margin:3px 0">${line(r)}</li>`).join('')}</ul>` : '';
  const body = `<table style="border-collapse:collapse;width:100%"><tr>`
    + tile('Due this week', v.dueThisWeek.length, '#0f766e')
    + tile('Overdue', v.overdue.length, v.overdue.length ? '#b91c1c' : '#0f766e')
    + tile('No owner set', v.noOwner.length, v.noOwner.length ? '#b45309' : '#0f766e')
    + `</tr></table>`
    + list('Overdue', v.overdue, (r) => `${esc(r.Lead)} – was due ${esc(niceStr(r['Follow-up due'], true))}`)
    + list('No owner set', v.noOwner, (r) => `${esc(r.Lead)} (${esc(r.Team)})`)
    + list('Waiting longest', v.oldest, (r) => `${esc(r.Lead)} – ${r.days} days`);
  return shell(`Follow-up review – ${nice(v.n)}`, '#0f766e', body, sheetUrl, 'Sent every Monday at 09:00 IST for the weekly follow-up review.');
}

if (typeof module !== 'undefined') module.exports = { fromCrm, isTrigger, followUpDueBy, ownerFor, buildFollowUpTask, weeklySummary, alertHtml, summaryHtml };
