# CRM → Ops follow-up handoff (n8n)

When a deal closes in your CRM, the assigned owner gets a task in a Google Sheet and a WhatsApp/email alert within
seconds, with a follow-up due date that respects business days and weekends. Every Monday at 09:00 IST, the team
gets a review of what's due, what's overdue, and what has no owner set.

Generic by design: `fromCrm()` in `handoff.js` is the one place that knows a specific CRM's field names (HubSpot,
Pipedrive, GoHighLevel, Zoho, ...) — point it at one real webhook payload and adjust that one function per client.
Everything else (the due-date math, the Sheet, the alerts, the weekly review) is CRM-agnostic.

Generalized 2026-11-18 from an earlier CRM-to-ops handoff built for a co-living operator (same underlying logic
and tests, different domain — see git history for the original).

- [What it does and why](docs/index.md) *(still describes the original move-in domain — update before client use)*
- [How it works](docs/how-it-works.md) *(same — update before client use)*
- [Set it up](docs/setup.md): run locally, credentials, test payloads, going live

Quick check of the rules: `node handoff.test.js` should print `handoff ok`.
Rebuild `workflow.json` after editing `handoff.js`: `SHEET_ID=<id> WA_PHONE_ID=<id> node build.js`.
