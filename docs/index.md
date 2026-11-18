# ClosedWon Relay

A small n8n automation for any business with a CRM. When a deal reaches **Closed Won**, the assigned owner hears
about it within seconds (WhatsApp and email), with a follow-up due date that respects business days. Every Monday
morning there's a review of what's due, what's overdue, and what has no owner set.

<figure>
<svg viewBox="0 0 760 360" role="img" aria-label="Five CRMs (HubSpot, Pipedrive, GoHighLevel, Zoho, Salesforce) all normalize through one mapping function, fromCrm(), into the same follow-up task, which then alerts the owner on WhatsApp and email, logs a row, and feeds the weekly review." style="max-width:100%;height:auto;font-family:inherit">
  <defs>
    <marker id="cwr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>

  <text x="195" y="58" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.75">deal reaches "Closed Won"</text>

  <!-- five CRM sources -->
  <g font-size="12" fill="currentColor">
    <rect x="20" y="82" width="140" height="28" rx="5" fill="none" stroke="currentColor"/>
    <text x="90" y="100" text-anchor="middle">HubSpot</text>
    <rect x="20" y="124" width="140" height="28" rx="5" fill="none" stroke="currentColor"/>
    <text x="90" y="142" text-anchor="middle">Pipedrive</text>
    <rect x="20" y="166" width="140" height="28" rx="5" fill="none" stroke="currentColor"/>
    <text x="90" y="184" text-anchor="middle">GoHighLevel</text>
    <rect x="20" y="208" width="140" height="28" rx="5" fill="none" stroke="currentColor"/>
    <text x="90" y="226" text-anchor="middle">Zoho</text>
    <rect x="20" y="250" width="140" height="28" rx="5" fill="none" stroke="currentColor"/>
    <text x="90" y="268" text-anchor="middle">Salesforce</text>
  </g>

  <!-- five lines converging on the one mapping point -->
  <g stroke="currentColor" stroke-width="1" opacity="0.55" marker-end="url(#cwr-arrow)">
    <line x1="160" y1="96" x2="240" y2="178"/>
    <line x1="160" y1="138" x2="240" y2="179"/>
    <line x1="160" y1="180" x2="240" y2="180"/>
    <line x1="160" y1="222" x2="240" y2="181"/>
    <line x1="160" y1="264" x2="240" y2="182"/>
  </g>

  <!-- the one customization point -->
  <circle cx="250" cy="180" r="9" fill="#0f766e"/>
  <text x="250" y="206" text-anchor="middle" font-size="12" fill="#0f766e">fromCrm()</text>
  <text x="250" y="220" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.7">one mapping point per client</text>

  <line x1="259" y1="180" x2="298" y2="180" stroke="currentColor" stroke-width="1.2" marker-end="url(#cwr-arrow)"/>

  <!-- the follow-up task -->
  <rect x="300" y="150" width="190" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="395" y="176" text-anchor="middle" font-size="12.5" fill="currentColor">Follow-up task created</text>
  <text x="395" y="193" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">due next business day</text>

  <!-- fan-out to alerts and the sheet -->
  <g stroke="currentColor" stroke-width="1.1" marker-end="url(#cwr-arrow)" fill="none">
    <path d="M490,165 Q540,120 578,84"/>
    <path d="M490,180 L578,180"/>
    <path d="M490,195 Q540,240 578,276"/>
  </g>
  <text x="533" y="118" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">alerts owner</text>
  <text x="533" y="238" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">logs row</text>

  <g font-size="12" fill="currentColor">
    <rect x="580" y="70" width="140" height="28" rx="5" fill="none" stroke="currentColor"/>
    <text x="650" y="88" text-anchor="middle">WhatsApp</text>
    <rect x="580" y="166" width="140" height="28" rx="5" fill="none" stroke="currentColor"/>
    <text x="650" y="184" text-anchor="middle">Email</text>
    <rect x="580" y="262" width="140" height="28" rx="5" fill="none" stroke="currentColor"/>
    <text x="650" y="280" text-anchor="middle">Follow-ups sheet</text>
  </g>

  <!-- weekly review -->
  <line x1="650" y1="290" x2="650" y2="318" stroke="currentColor" stroke-width="1.1" stroke-dasharray="4 3" marker-end="url(#cwr-arrow)"/>
  <text x="672" y="308" font-size="10.5" fill="currentColor" opacity="0.75">every Monday</text>
  <rect x="560" y="320" width="180" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="650" y="340" text-anchor="middle" font-size="12" fill="currentColor">Weekly review, 09:00</text>
</svg>
<figcaption>Five CRMs, one mapping point. <code>fromCrm()</code> is the only thing that changes per client — the task, the alerts, and the weekly review run the same way regardless of which CRM is behind them.</figcaption>
</figure>

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
