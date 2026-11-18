// Builds workflow.json (importable into n8n) with handoff.js inlined into the Code nodes.
// Run: SHEET_ID=<id> WA_PHONE_ID=<id> node build.js
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const LOGIC = fs.readFileSync(path.join(__dirname, 'handoff.js'), 'utf8');
const SHEET_ID = process.env.SHEET_ID || 'REPLACE_WITH_SHEET_ID';
const WA_PHONE_ID = process.env.WA_PHONE_ID || 'REPLACE_WITH_WHATSAPP_PHONE_NUMBER_ID';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;

const doc = { __rl: true, mode: 'id', value: SHEET_ID };
const tab = (name) => ({ __rl: true, mode: 'name', value: name });
const sheetsCred = { googleSheetsOAuth2Api: { id: process.env.GSHEETS_CRED_ID || 'crmGoogleSheets01', name: 'Google Sheets account' } };
const waCred = { whatsAppApi: { id: 'crmWhatsApp000001', name: 'WhatsApp account' } };
const gmailCred = { gmailOAuth2: { id: process.env.GMAIL_CRED_ID || 'crmGmail000000001', name: 'Gmail account' } };
let n = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) =>
  ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra });
const sticky = (name, content, position, width, height, color) =>
  node(name, 'stickyNote', 1, position, { content, width, height, color });
const readRows = (name, sheet, position, extra = {}) =>
  node(name, 'googleSheets', 4.7, position, { documentId: doc, sheetName: tab(sheet), options: {} }, { credentials: sheetsCred, alwaysOutputData: true, executeOnce: true, ...extra });
const whatsapp = (name, position, to, text) =>
  node(name, 'whatsApp', 1.1, position, { operation: 'send', phoneNumberId: WA_PHONE_ID, recipientPhoneNumber: to, textBody: text, additionalFields: {} }, { credentials: waCred, onError: 'continueRegularOutput' });
// ponytail: WhatsApp is live but Meta refuses sends until the account has billing; continueRegularOutput keeps the run (and the email) going
const gmail = (name, position, to, subject, text) =>
  node(name, 'gmail', 2.1, position, { sendTo: to, subject, emailType: 'html', message: text, options: { appendAttribution: false } }, { credentials: gmailCred, webhookId: `9e1a0000-0000-4000-8000-${String(n + 1).padStart(12, '0')}` });

const BUILD_TASK = `${LOGIC}
const lead = fromCrm($('CRM – Lead stage changed').first().json.body);
const settings = $('Read Settings').all().map((i) => i.json);
const stage = (settings.find((s) => s.Role === 'Trigger stage') || {}).Name || 'Closed Won';
if (!isTrigger(lead, stage)) return [];
const existing = lead.leadId ? ($('Read existing task').all().map((i) => i.json).find((r) => String(r['CRM Lead ID']) === lead.leadId) || null) : null;
const t = buildFollowUpTask(lead, new Date(), settings, existing);
return [{ json: { ...t.row, _to: t.to || '', _email: t.email || '', _subject: t.subject, _text: t.text, _html: alertHtml(t, '${SHEET_URL}') } }];`;

const BUILD_SUMMARY = `${LOGIC}
const rows = $('Read Follow-ups').all().map((i) => i.json).filter((r) => r.Status);
const text = weeklySummary(rows, new Date(), '${SHEET_URL}');
const html = summaryHtml(rows, new Date(), '${SHEET_URL}');
return $('Read Settings (Weekly)').all().map((i) => i.json)
  .filter((s) => ['Team Owner', 'Fallback Owner'].includes(s.Role) && (String(s.WhatsApp || '').trim() || String(s.Email || '').trim()))
  .map((s) => ({ json: { _to: String(s.WhatsApp || '').trim(), _email: String(s.Email || '').trim(), _subject: text.split('\\n')[0], _text: text, _html: html } }))
  .filter((m, i, all) => all.findIndex((x) => x._to === m._to && x._email === m._email) === i); // one message per person`;

const nodes = [
  sticky('Note – what this is', '## CRM → Ops follow-up handoff\nYour CRM fires **Closed Won** → a Follow-up task lands in the Follow-ups sheet (with a due date) → WhatsApp/email to the deal\'s owner.\nEvery Monday 09:00 IST: the weekly follow-up review.\nRules live in one place: the Code nodes (source: handoff.js). Customize `fromCrm()` for your CRM\'s actual field names.', [-60, -320], 580, 220, 7),
  sticky('Note – sample payload', '### Sample payload\nRight now `send-test.sh` posts a generic CRM-shaped sample lead.\nTo go live: in your CRM (HubSpot, Pipedrive, GoHighLevel, Zoho, ...) create ONE webhook on the deal-closed event pointing here, with custom header `X-Handoff-Secret`. Capture one real payload and adjust `fromCrm()` only.', [-60, 190], 460, 220, 3),
  sticky('Note – WhatsApp', '### WhatsApp + email\nEmail (Gmail) carries the demo. WhatsApp is wired and live; Meta refuses sends until the account has billing set up, so a failed WhatsApp never stops the email.\nProduction: swap for the WATI node (`n8n-nodes-wati` → Send Template Message) with an approved utility template.', [1060, 260], 460, 200, 4),
  sticky('Note – polling', '### Alternative entry (off)\nIf webhooks aren\'t available from the CRM, poll its "recently updated deals" API every 15 min with its access keys. Map its output to the same fields before **Build Follow-up task**.', [-60, 590], 460, 180, 5),

  node('CRM – Lead stage changed', 'webhook', 2.2, [0, 0], { httpMethod: 'POST', path: 'crm-lead-closed', authentication: 'headerAuth', responseMode: 'onReceived', options: {} },
    { webhookId: 'a7c1e7c2-1d7e-4c55-9e1a-1a2b3c4d5e6f', credentials: { httpHeaderAuth: { id: 'crmWebhookSecret1', name: 'CRM webhook secret' } } }),
  readRows('Read Settings', 'Settings', [220, 0]),
  readRows('Read existing task', 'Follow-ups', [440, 0], {
    parameters: { documentId: doc, sheetName: tab('Follow-ups'), filtersUI: { values: [{ lookupColumn: 'CRM Lead ID', lookupValue: "={{ $('CRM – Lead stage changed').first().json.body.id }}" }] }, options: {} },
  }),
  node('Build Follow-up task', 'code', 2, [660, 0], { jsCode: BUILD_TASK }),
  node('Follow-ups – add or update', 'googleSheets', 4.7, [880, 0], {
    operation: 'appendOrUpdate', documentId: doc, sheetName: tab('Follow-ups'),
    columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['CRM Lead ID'], schema: [] },
    options: { cellFormat: 'RAW', handlingExtraData: 'ignoreIt' },
  }, { credentials: sheetsCred }),
  node('Has owner contact?', 'if', 2.2, [1100, 0], {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [
        { id: 'c0ffee00-0000-4000-8000-000000000001', leftValue: "={{ $('Build Follow-up task').item.json._to }}", rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } },
        { id: 'c0ffee00-0000-4000-8000-000000000002', leftValue: "={{ $('Build Follow-up task').item.json._email }}", rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } },
      ],
      combinator: 'or',
    },
    options: {},
  }),
  gmail('Email – alert owner', [1320, 110], "={{ $('Build Follow-up task').item.json._email }}", "={{ $('Build Follow-up task').item.json._subject }}", "={{ $('Build Follow-up task').item.json._html }}"),
  whatsapp('WhatsApp – alert owner', [1320, -120], "={{ $('Build Follow-up task').item.json._to }}", "={{ $('Build Follow-up task').item.json._text }}"),

  node('Every 15 min', 'scheduleTrigger', 1.2, [0, 400], { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } }, { disabled: true }),
  node('CRM – Fetch recently updated deals', 'httpRequest', 4.2, [220, 400], {
    method: 'GET', url: 'https://api.example-crm.com/v1/deals?updated_since={{ $now.minus({ minutes: 15 }).toISO() }}',
    authentication: 'genericCredentialType', genericAuthType: 'httpCustomAuth',
    options: {},
  }, { disabled: true, notes: 'Swap the URL/auth for the client\'s actual CRM API. Map its output to the same fields before Build Follow-up task.' }),

  node('Monday 09:00', 'scheduleTrigger', 1.2, [0, 900], { rule: { interval: [{ field: 'cronExpression', expression: '0 9 * * 1' }] } }),
  readRows('Read Follow-ups', 'Follow-ups', [220, 900]),
  readRows('Read Settings (Weekly)', 'Settings', [440, 900]),
  node('Build weekly summary', 'code', 2, [660, 900], { jsCode: BUILD_SUMMARY }),
  gmail('Email – weekly summary', [900, 1020], '={{ $json._email }}', '={{ $json._subject }}', '={{ $json._html }}'),
  whatsapp('WhatsApp – weekly summary', [900, 780], '={{ $json._to }}', '={{ $json._text }}'),
];

const link = (to) => ({ main: [[{ node: to, type: 'main', index: 0 }]] });
const connections = {
  'CRM – Lead stage changed': link('Read Settings'),
  'Read Settings': link('Read existing task'),
  'Read existing task': link('Build Follow-up task'),
  'Build Follow-up task': link('Follow-ups – add or update'),
  'Follow-ups – add or update': link('Has owner contact?'),
  'Has owner contact?': { main: [[{ node: 'WhatsApp – alert owner', type: 'main', index: 0 }, { node: 'Email – alert owner', type: 'main', index: 0 }], []] },
  'Every 15 min': link('CRM – Fetch recently updated deals'),
  'Monday 09:00': link('Read Follow-ups'),
  'Read Follow-ups': link('Read Settings (Weekly)'),
  'Read Settings (Weekly)': link('Build weekly summary'),
  'Build weekly summary': { main: [[{ node: 'WhatsApp – weekly summary', type: 'main', index: 0 }, { node: 'Email – weekly summary', type: 'main', index: 0 }]] },
};

const wf = { id: 'crmFollowupHandoff1', name: 'CRM to Ops follow-up handoff', active: false, nodes, connections, settings: { timezone: 'Asia/Kolkata', executionOrder: 'v1' }, pinData: {} };

// self-check: names wired correctly, logic inlined
const names = new Set(nodes.map((x) => x.name));
for (const [from, c] of Object.entries(connections)) {
  assert(names.has(from), from);
  for (const out of c.main) for (const e of out) assert(names.has(e.node), e.node);
}
for (const x of nodes.filter((x) => x.type.endsWith('.code'))) assert.match(x.parameters.jsCode, /function followUpDueBy/);
// the inlined Code bodies must at least parse
for (const x of nodes.filter((x) => x.type.endsWith('.code'))) new Function('$', x.parameters.jsCode);

fs.writeFileSync(path.join(__dirname, 'workflow.json'), JSON.stringify(wf, null, 2));
console.log('build ok');
