# CloseLoop (n8n)

Never let a closed deal go cold — a CRM-to-ops follow-up handoff.

When a deal closes in your CRM, the assigned owner gets a task in a Google Sheet and a WhatsApp/email alert within
seconds, with a follow-up due date that respects business days and weekends. Every Monday at 09:00 IST, the team
gets a review of what's due, what's overdue, and what has no owner set.

Generic by design: `fromCrm()` in `handoff.js` is the one place that knows a specific CRM's field names. Works with
**HubSpot, Pipedrive, GoHighLevel, Zoho, and Salesforce** out of the box — see [the field mapping](docs/crm-mapping.md)
for each — and the same pattern extends to any CRM with a deal-closed webhook. Point it at one real payload and
adjust that one function per client; everything else (the due-date math, the Sheet, the alerts, the weekly review)
stays CRM-agnostic.

Generalized 2026-11-18 from an earlier CRM-to-ops handoff built for a co-living operator (same underlying logic
and tests, different domain — see git history for the original).

- [What it does and why](docs/index.md)
- [How it works](docs/how-it-works.md): the flow, the due-date math, flags
- [Set it up](docs/setup.md): run locally, credentials, test payloads, going live

Quick check of the rules: `node handoff.test.js` should print `handoff ok`.
Rebuild `workflow.json` after editing `handoff.js`: `SHEET_ID=<id> WA_PHONE_ID=<id> node build.js`.
