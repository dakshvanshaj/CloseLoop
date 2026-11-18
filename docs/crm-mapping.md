# CRM field mapping

`fromCrm()` in `handoff.js` is the one place that needs adjusting per client. Below is the starting map for five
common CRMs, based on each platform's standard deal/webhook fields. **Verify against one real webhook payload
from the client before going live** — field names can vary by account configuration and API version; this table
is the fast starting point, not a guarantee.

| Our field | HubSpot (Deals) | Pipedrive | GoHighLevel | Zoho CRM | Salesforce |
|---|---|---|---|---|---|
| `leadId` | `dealId` | `id` | `opportunity.id` | `id` | `Id` |
| `name` | associated contact `firstname`+`lastname` | linked person `name` | `contact.name` | `Contact_Name` | linked Contact `FirstName`+`LastName` |
| `phone` | contact `phone` | person `phone` | `contact.phone` | contact `Phone` | Contact `Phone` |
| `email` | contact `email` | person `email` | `contact.email` | contact `Email` | Contact `Email` |
| `team` | `pipeline` | `pipeline_id`/`pipeline_name` | `opportunity.pipelineStageId` | n/a — use `Deal_Source` or a custom field | `Opportunity.RecordType` or a custom field |
| `deal_value` | `amount` | `value` | `opportunity.monetaryValue` | `Amount` | `Amount` |
| `owner` | `hubspot_owner_id` (resolve to name) | `owner_id`/`owner_name` | `assignedTo` | `Owner.name` | `OwnerId` (resolve to `Owner.Name`) |
| `stage` | `dealstage` | `stage_id`/`stage_name` | `opportunity.pipelineStageId` (resolve to name) | `Stage` | `StageName` |

Five is the starting set — the same pattern (map the client's webhook JSON into our eight generic fields) works for
any CRM with a deal-closed webhook or Zapier/Make-style trigger, not just these five.
