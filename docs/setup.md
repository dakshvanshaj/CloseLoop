# Set it up

You need Docker and Node 18+. Node is only used for the tests and `build.js`; n8n itself runs in Docker.

## 1. Run n8n locally

From the repo folder:

```bash
docker run -d --name n8n -p 5678:5678 -e GENERIC_TIMEZONE=Asia/Kolkata -e TZ=Asia/Kolkata -v n8n_data:/home/node/.n8n -v "$PWD:/files" docker.n8n.io/n8nio/n8n
```

Open <http://localhost:5678> and create your login.

## 2. Google Sheet

Create a Sheet with two tabs.

**`Follow-ups`**: row 1 headers, in this order:

```text
Received at, CRM Lead ID, Lead, Phone, Email, Team, Deal Value, Owner, Follow-up due, Status, Flags
```

- Give `Status` a dropdown: `New, Contacted`.
- Format `Received at` and `Follow-up due` as plain text (Format → Number → Plain text). Otherwise dates that get
  retyped won't count in the weekly summary.

**`Settings`**: headers `Role, Team, Name, WhatsApp, Email`:

| Role | Team | Name | WhatsApp | Email |
|---|---|---|---|---|
| Trigger stage | | Closed Won | | |
| Team Owner | Enterprise | *name* | *number* | *email* |
| Team Owner | SMB | *name* | *number* | *email* |
| Fallback Owner | | *name* | *number* | *email* |

- Format the WhatsApp column as plain text, and write numbers with the country code, e.g. `919800000001`.
- `Fallback Owner` is used when a deal's team doesn't match any `Team Owner` row.
- `Trigger stage` is the CRM stage that creates a task — rename to match the client's actual "won" stage name.

## 3. Credentials in n8n

- **Google Sheets OAuth2 and Gmail OAuth2** (one OAuth client covers both; enable the Sheets, Drive and Gmail APIs):
  1. In Google Cloud, create an OAuth client with redirect URI `http://localhost:5678/rest/oauth2-credential/callback`.
  2. Add the credential in n8n and sign in.
- **WhatsApp:**
  1. On developers.facebook.com, create an app and add WhatsApp.
  2. On API Setup, add and verify your phone as a recipient. Copy the *Phone number ID*, the *WhatsApp Business Account ID* and the access token into an n8n **WhatsApp API** credential.
  3. Send "hi" from your phone to the test number. Plain-text messages only work within 24 hours of a message from your side.
- **Webhook secret:**
  1. Create a **Header Auth** credential named `CRM webhook secret`, with header name `X-Handoff-Secret` and a long random value.
  2. Copy `.env.example` to `.env` and put the same value in it.

## 4. Build, import, publish

```bash
SHEET_ID=<sheet id> WA_PHONE_ID=<phone number id> node build.js
```

```bash
docker exec n8n n8n import:workflow --input=/files/workflow.json && docker exec n8n n8n publish:workflow --id=crmFollowupHandoff1 && docker restart n8n
```

Open the workflow and pick your credentials on the webhook node, every Google Sheets node and both WhatsApp nodes. Then publish.
Re-importing resets the credential picks, so pick them again after every rebuild.

## 5. Try it

```bash
./send-test.sh payloads/closed-won.json
```

| Payload | What should happen |
|---|---|
| `closed-won.json` | New row in Follow-ups, WhatsApp to the Enterprise team's owner |
| same file again | Still one row; the alert starts `Updated:` |
| `missing-fields.json` | Row with Flags `Missing: lead id, sales owner`, alert starts `⚠` |
| `closed-lost.json` | Nothing: not Closed Won |

To see the weekly summary now, open **Monday 09:00** in the editor and click *Execute workflow*.

To run the rule tests: `node handoff.test.js` should print `handoff ok`.

## Going live with a real CRM

**Route 1: webhook (recommended).**

1. In the client's CRM, create **one** webhook on the deal-closed event (see the [field mapping](crm-mapping.md) for
   where that lives per CRM).
   - **Point it at the production webhook URL** and add the custom header `X-Handoff-Secret`.
   - **Don't subscribe to more than one overlapping event.** A duplicate firing at the same moment could create a
     duplicate row.
2. n8n must be reachable from the internet: n8n Cloud, or a tunnel.

**Route 2: polling, if the CRM has no webhook.**

1. Enable the two greyed-out nodes.
2. Point `CRM – Fetch recently updated deals` at the client's actual API and auth.
3. Map the response to the same fields before **Build Follow-up task**.

**Production WhatsApp:** swap the WhatsApp nodes for your provider's node (for WATI, `n8n-nodes-wati` → Send Template Message)
with an approved utility template.

**Before going live:** capture one real webhook payload from the client's CRM and adjust `fromCrm()` in `handoff.js`
to the real field names — start from the [5-CRM mapping](crm-mapping.md) if they use HubSpot, Pipedrive, GoHighLevel,
Zoho, or Salesforce.
