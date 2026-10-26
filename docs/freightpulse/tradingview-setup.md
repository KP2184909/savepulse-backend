# Current deployed receiver

The dedicated free Supabase Sandbox receiver is now deployed. Use https://sktzydyiwqylpstxjicf.supabase.co/functions/v1/freightpulse-tv-sandbox directly; see sandbox-deployment.md for verified status. This supersedes the provisional Node hosting instructions below. The Node endpoint is retained for future backend deployment, not the URL to paste today.

# FreightPulse Pine → sandbox receiver

## Deliverables and status

- `pine/freightpulse/container-next4-sandbox.pine`: Pine v6, CS11!–CS61!, 1D standard NYMEX/NYMEX_DL charts, rule `freightpulse.cs.rebound-next-4.lower-close-restart.v1`, script `freightpulse.container.next4.transport.v4`.
- `pine/freightpulse/context-telemetry-sandbox.pine`: Pine v6, INDEX:BDI and NYSE:ZIM, 1D standard charts; transport diagnostics only. No BDI strategy or substitute ZIM algorithm. script `freightpulse.context.telemetry.v1`.
- Receiver: POST `/api/v1/freightpulse/tradingview/test`. All eight charts use the same receiver; symbol/family/FBX route distinguish them. Not Stripe billing webhook or SavePulse webhook.
- NOT deployed/activated. Pine compiler and actual TradingView delivery are NOT VERIFIED yet. Do not create enabled alerts against the Production hostname based on these files alone.

## Destination URL

Use `https://<verified-isolated-sandbox-host>/api/v1/freightpulse/tradingview/test` after staging deployment/configuration and readiness checks. No public isolated sandbox backend hostname has been provisioned/verified in this task. The Netlify Deploy Preview's existing `/api/*` rewrite points to the current backend and must not be mistaken for an isolated sandbox receiver. Production SavePulse backend currently does not contain this new endpoint; its URL is not ready to paste into an alert.

No hosting upgrade or paid service is authorized. Existing free Render instances may cold-start too slowly for TradingView's three-second deadline. A 200 response is issued only AFTER durable ingest succeeds; timeout is not acknowledged as success. End-to-end delivery must be measured on the eventual host before declaring readiness. A retry uses the same canonical bar identity and is deduplicated.

## Required isolated backend configuration

- `FREIGHTPULSE_SANDBOX_ENABLED=true`
- `FREIGHT_TV_TEST_ENABLED=true`
- `FREIGHT_TV_TEST_SECRET`: separate random test-only webhook token, 24–128 URL-safe characters (letters, digits, underscore, hyphen). Never reuse SavePulse WEBHOOK_SECRET, worker bearer token, job token, Stripe key/signing secret or user login credentials.
- Isolated Supabase test storage configured by existing storage integration; do not point test ingestion at customer data.
- Explicit `FREIGHT_TEST_RULES_JSON` script allowlist, for example the value below. No source freshness SLA is invented; Pine cannot supply actual publisher timestamps, so this transport reports unknown freshness and cannot show current assessments.

```json
{"versions":{"CS11!":["freightpulse.container.next4.transport.v4"],"CS21!":["freightpulse.container.next4.transport.v4"],"CS31!":["freightpulse.container.next4.transport.v4"],"CS41!":["freightpulse.container.next4.transport.v4"],"CS51!":["freightpulse.container.next4.transport.v4"],"CS61!":["freightpulse.container.next4.transport.v4"],"BDI":["freightpulse.context.telemetry.v1"],"ZIM":["freightpulse.context.telemetry.v1"]}}
```

Keep `FREIGHT_TEST_EMAIL_ENABLED=false`. Live ingestion remains disabled regardless of these settings. Subscription/Stripe configuration is separate and not required to authorize machine ingestion; member reports still require backend-verified member entitlement.

## Pine and alert setup after receiver readiness

1. Keep source private. Paste the appropriate file into a NEW Pine Editor script, never overwrite the existing SavePulse engine. Compile first, then add to a standard 1D chart. No Pine compiler success is claimed in this delivery.
2. CS: select the chart's actual NYMEX CS symbol. The script derives the FBX route automatically. Choose an explicit review start. Zero leaves the rule inactive. A lower close that invalidates an active window is now the baseline for waiting for a fresh rebound. The fresh confirmation is excluded and the next available bar starts a new day1. There is no overlapping restart while the current window remains active. Restart after normal four-day expiry and rollover remain unapproved. A lower close on window days1–4 retains that day's background but sends invalidated with null windowDay/windowStart after close. No next day is counted. Flat closes continue an active cycle; while waiting they do not count as a rebound. No synthetic bars are added for missing dates. Confirmation is excluded and the next data-bearing daily bar is day1.
3. BDI/ZIM: add the context telemetry script to each chart. Its unclear field is a transport placeholder; the backend forces assessment not enabled. Do not interpret it as an actual market assessment. The original ZIM Daily Feed EMA14/60 source has not been verified; a different Supertrend file is not a valid replacement.
4. Enter the dedicated FreightPulse TEST token yourself through the private indicator Inputs, then enable sandbox output. It is not a password-masked input. `display.none` only hides it from status/data-window displays; do not share Inputs screenshots or publish configured script snapshots. Alert names and chart labels never include the token. No secret is stored in the repository.
5. Create one alert per chart (six CS plus BDI/ZIM if testing all eight). Condition: this script → Any alert() function call. The script sends only realtime confirmed daily bars with alert.freq_once_per_bar_close. Historical bars/replay do not constitute webhook delivery.
6. In Notifications enable Webhook URL and enter only the verified sandbox receiver URL. Message comes from the alert() JSON envelope, not a manually copied example. No real customer emails/Discord alerts should be enabled.
7. Script/input changes do not update existing alert snapshots: recreate alerts after changing token/version/start inputs. Inspect TradingView delivery status AND receiver's accepted/duplicate result; a delivered HTTP request is not proof of current data or a customer recommendation.

All JSON carries `{secret_key, payload}`. The receiver compares only the scoped token, rejects extra envelope fields/live dataMode, strips token before validating/persisting payload, and responds without echoing it. TradingView supports JSON POST but no custom bearer header in this flow. The header-authenticated internal worker endpoint remains separate. Never send real account/API credentials in the payload.

## Instrument mapping

| Chart | family | route |
|---|---|---|
| NYMEX:CS11! | container | FBX01 |
| NYMEX:CS21! | container | FBX02 |
| NYMEX:CS31! | container | FBX03 |
| NYMEX:CS41! | container | FBX11 |
| NYMEX:CS51! | container | FBX12 |
| NYMEX:CS61! | container | FBX13 |
| INDEX:BDI | bulk | null |
| NYSE:ZIM | context | null |

References: https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/ and https://www.tradingview.com/pine-script-docs/concepts/alerts/
