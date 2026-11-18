# CRM → Ops follow-up handoff

A small n8n automation for any business with a CRM. When a deal reaches **Closed Won**, the assigned owner hears
about it within seconds (WhatsApp and email), with a follow-up due date that respects business days. Every Monday
morning there's a review of what's due, what's overdue, and what has no owner set.

## The problem this solves

In most CRMs, "Closed Won" is where the sales side's job ends and the ops/fulfillment side's job should start — but
nothing automatically tells ops the deal closed. The handoff depends on someone remembering to mention it, which
means:

- **Ops learns about a new deal only when something goes wrong** — a client calls asking where their onboarding is.
- **Friday-afternoon closes sit untouched until Monday**, because nobody's watching for them over the weekend.

The fix is the same shape regardless of which CRM is involved:

1. Closed Won creates a follow-up task the same day, automatically.
2. The follow-up is due by 12:00 IST the next business day — weekend closes get a Monday slot instead of sitting idle.
3. A short weekly review catches anything overdue or missing an owner.

This workflow runs that process without anyone having to remember it.

## What it does

1. The CRM calls this workflow when a deal reaches **Closed Won** (webhook, or polling if the CRM has no webhook).
2. The workflow checks what's needed (lead name, owner, a contact method) and flags anything missing in plain words.
3. It works out the **follow-up due date** ([rule](how-it-works.md#follow-up-due-rule)).
4. It adds the task to the **Follow-ups** Google Sheet, or updates it if the same deal comes in again.
5. It alerts the deal's owner on WhatsApp and by email.
6. **Every Monday at 09:00 IST**, everyone listed in Settings gets the weekly review.

Ops/Sales closes the loop in the Sheet by changing Status: `New → Contacted`. There's no new app to learn.

## Status

| Part | State |
|---|---|
| Rules (follow-up due date, flags, weekly summary) | Built and tested, in Node and inside n8n |
| Workflow in n8n | Built, generic CRM webhook with a secret header |
| Email alerts + Google Sheet end-to-end | Logic tested (`node handoff.test.js`); not yet run against a live Sheet/Gmail for this generic version |
| WhatsApp alerts | Wired, same pattern as the original deployment; needs a WhatsApp Business account with billing to actually send |
| A real CRM connection | Sample payloads only — see the [5-CRM field mapping](crm-mapping.md). Capture one real webhook payload per client and adjust `fromCrm()` |

Next: [how it works](how-it-works.md) · [set it up](setup.md) · [CRM field mapping](crm-mapping.md)
