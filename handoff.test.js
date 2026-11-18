// Run: node handoff.test.js
const assert = require('node:assert/strict');
const { fromCrm, isTrigger, followUpDueBy, ownerFor, buildFollowUpTask, weeklySummary, alertHtml, summaryHtml } = require('./handoff.js');

const F = (iso) => followUpDueBy(new Date(iso));
// business-day rule: due 12:00 IST the next business day; weekend closes get Monday noon
assert.deepEqual(F('2026-10-28T10:00:00+05:30'), { dueBy: '2026-10-29 12:00', flag: '' }); // Wed -> Thu
assert.deepEqual(F('2026-11-02T08:00:00+05:30'), { dueBy: '2026-11-03 12:00', flag: '' }); // Mon -> Tue
assert.deepEqual(F('2026-11-05T23:00:00+05:30'), { dueBy: '2026-11-06 12:00', flag: '' }); // Thu -> Fri
assert.deepEqual(F('2026-10-30T16:00:00+05:30'), { dueBy: '2026-11-02 12:00', flag: '' }); // Fri -> Mon (weekend skipped)
assert.deepEqual(F('2026-10-31T09:00:00+05:30'), { dueBy: '2026-11-02 12:00', flag: 'Closed on a weekend → Monday slot' }); // Sat
assert.deepEqual(F('2026-11-01T20:00:00+05:30'), { dueBy: '2026-11-02 12:00', flag: 'Closed on a weekend → Monday slot' }); // Sun

// fromCrm normalisation
const base = { id: 'c1', name: 'Priya S', phone: '+919800000001', email: 'priya@example.com', team: 'Enterprise', deal_value: '45,000', owner: 'Rohit K', stage: 'Closed Won' };
const L = fromCrm(base);
assert.equal(L.leadId, 'c1'); assert.equal(L.name, 'Priya S'); assert.equal(L.team, 'Enterprise'); assert.equal(L.dealValue, 45000);
assert.equal(fromCrm({ ...base, owner: 'N/A' }).owner, '');
assert.equal(fromCrm({ first_name: 'A', last_name: 'B' }).name, 'A B');
assert.equal(isTrigger(fromCrm({ ...base, stage: ' closed won ' }), 'Closed Won'), true);
assert.equal(isTrigger(fromCrm({ ...base, stage: 'Closed Lost' }), 'Closed Won'), false);

// buildFollowUpTask
const S = [
  { Role: 'Trigger stage', Team: '', Name: 'Closed Won' },
  { Role: 'Team Owner', Team: 'Enterprise', Name: 'Asha', WhatsApp: '+919800000010' },
  { Role: 'Fallback Owner', Team: '', Name: 'Head', WhatsApp: '+919800000099' },
];
const now = new Date('2026-10-28T10:00:00+05:30'); // Wed 10:00 IST
const missingFields = buildFollowUpTask(fromCrm({ ...base, id: '', owner: '' }), now, S, null);
assert.equal(missingFields.row.Flags, 'Missing: lead id, sales owner');
assert.equal(missingFields.row.Status, 'New'); assert.equal(missingFields.to, '+919800000010');
assert.match(missingFields.text, /^⚠ Missing: lead id, sales owner/);
assert.match(missingFields.row['CRM Lead ID'], /^no-id-/);
assert.deepEqual(Object.keys(missingFields.row), ['Received at', 'CRM Lead ID', 'Lead', 'Phone', 'Email', 'Team', 'Deal Value', 'Owner', 'Follow-up due', 'Status', 'Flags']);

const ok = buildFollowUpTask(L, now, S, null);
assert.equal(ok.row.Flags, '');
assert.equal(ok.text, 'New deal closed: Priya S (₹45000). Follow up by Thu 29 Oct 12:00. Sales: Rohit K.');
assert.equal(ok.row['Follow-up due'], '2026-10-29 12:00');

// fallback owner when team doesn't match any Team Owner row
assert.equal(buildFollowUpTask(fromCrm({ ...base, team: 'SMB' }), now, S, null).to, '+919800000099');
const none = buildFollowUpTask(fromCrm({ ...base, team: 'SMB' }), now, [], null);
assert.equal(none.to, null); assert.match(none.row.Flags, /No owner set for team SMB/);

// update keeps Status and first-arrival time, doesn't reset the due date to "now"
const prev = { 'Received at': '2026-10-20 09:00', 'CRM Lead ID': 'c1', Status: 'Contacted' };
const up = buildFollowUpTask(L, now, S, prev);
assert.match(up.text, /^Updated: New deal closed/);
assert.equal(up.row.Status, 'Contacted'); // ops progress isn't overwritten by a CRM edit
assert.equal(up.row['Received at'], '2026-10-20 09:00');

// email channel: a contact with only an Email still counts
const SE = [{ Role: 'Team Owner', Team: 'Enterprise', Name: 'Asha', Email: 'asha@example.com' }];
const e = buildFollowUpTask(L, now, SE, null);
assert.equal(e.to, null); assert.equal(e.email, 'asha@example.com'); assert.equal(e.row.Flags, '');

// weeklySummary: one overdue, one due this week, one no-owner, one Contacted (ignored)
const rows = [
  { 'Received at': '2026-10-20 09:00', Lead: 'A1', Team: 'Enterprise', 'Follow-up due': '2026-10-27 12:00', Status: 'New', Flags: '' },
  { 'Received at': '2026-10-26 09:00', Lead: 'B1', Team: 'Enterprise', 'Follow-up due': '2026-11-06 12:00', Status: 'New', Flags: '' },
  { 'Received at': '2026-10-22 09:00', Lead: 'C1', Team: 'SMB', 'Follow-up due': '2026-10-23 12:00', Status: 'New', Flags: 'No owner set for team SMB' },
  { 'Received at': '2026-10-01 09:00', Lead: 'D1', Team: 'Enterprise', 'Follow-up due': '2026-10-02 12:00', Status: 'Contacted', Flags: '' },
];
const s = weeklySummary(rows, new Date('2026-11-02T09:00:00+05:30'), 'https://sheet');
assert.match(s, /Due this week: 1/); assert.match(s, /Overdue: 2/); assert.match(s, /No owner set: 1/);
assert.match(s, /A1, 13 days/); assert.doesNotMatch(s, /D1/); assert.match(s, /https:\/\/sheet/);

// HTML emails, and XSS escaping
const h1 = alertHtml(ok, 'https://sheet');
assert.match(h1, /New deal/); assert.match(h1, /Thu 29 Oct 12:00/); assert.match(h1, /href="https:\/\/sheet"/);
const h2 = alertHtml(missingFields, 'https://sheet');
assert.match(h2, /Missing: lead id, sales owner/); assert.match(h2, /#fef3c7/);
assert.match(alertHtml(up, 'https://sheet'), /Updated/);
const evil = buildFollowUpTask(fromCrm({ ...base, name: '<script>x</script>' }), now, S, null);
assert.doesNotMatch(alertHtml(evil, 'https://sheet'), /<script>/); assert.match(alertHtml(evil, 'https://sheet'), /&lt;script&gt;/);
const sh = summaryHtml(rows, new Date('2026-11-02T09:00:00+05:30'), 'https://sheet');
assert.match(sh, /Follow-up review/); assert.match(sh, /A1/); assert.doesNotMatch(sh, /D1/);
console.log('handoff ok');
