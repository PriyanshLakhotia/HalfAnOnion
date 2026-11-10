# Cloud Run companion

Private household adapter around the official Codex app-server. The owner connects a dedicated session through **Settings → Assistant → Connect ChatGPT** on the existing Site. No authoring-machine credentials are copied. This is a bounded personal assistant, not a general OpenAI API proxy; Codex plan limits and account availability still apply. The selected model must complete a real turn before entitlement is considered verified.

## Request-based hosting

Deployment configuration: project `halfanonion`, region `europe-west4`, service `half-an-onion-companion`, minimum **0**, maximum **1**, request-based CPU (`cpuIdle: true`), 2 vCPU / 2 GiB. Requests wake it from zero. Device login streams its code and holds the HTTP request open while the owner authorizes, so authentication does not rely on background CPU after a response. Inference stays inside the active request.

The sign-in dialog has **Copy code** and can be hidden without losing its code. **Show sign-in code** reopens it; after a page refresh, **Resume sign-in** attaches to the same pending login. Concurrent `/connect` requests share one login process and lease, replaying the original code and expiry. Codes stay in process memory and are available only through the authenticated owner connection route. An expired attempt releases the session so the owner can request a new code. A process restart cannot restore an unfinished login; its storage lease expires before another process can start.

A private GCS object stores the dedicated login, daily budget and short-lived receipts. Generation-checked writes and a 240-second lease fence concurrent instances and overlapping revisions. Credentials are restored into isolated ephemeral `/data/codex`, refreshed by Codex, then persisted and removed locally. A request watchdog stops Codex before its lease expires. Never mount a desktop auth directory. Interrupted commands are not silently replayed. Cached results last eight days to handle Scheduler retries; each food operation also has a D1 receipt.

Only `/healthz` is public. Site calls require the server-side `BRIDGE_SECRET`; scheduled routes require a verified Google OIDC token with the exact service audience and scheduler email. The owner alone can connect/disconnect via the Site. The service does not accept arbitrary model endpoints, shell tools, filesystem tools or caller-selected retrieval URLs.

## Assistant output contract

`src/domain/assistant.ts` derives the model's typed JSON output from the kitchen's Zod entity schemas. Creates use typed objects; edits use typed field/value/previous-value entries. Recipe and shopping origins are separate enums, prerequisites is text, recipe steps/ingredients/tags are arrays, and conversational replies may contain zero actions. The companion validates the entire batch against a cloned kitchen snapshot, including references and concurrent-edit expectations, before returning it. Invalid output gets one correction attempt within the request deadline. Failed correction returns a useful error and does not write household records. The Site revalidates before its atomic transaction; scheduled jobs retain their narrower proposal-only authorization.

Run `npm run contract:build` after changing domain schemas and commit `companion/contract.mjs`. `npm run check` rejects a stale generated contract. GitHub Actions checks contract freshness, builds the Worker, and runs both application and companion tests on pushes and pull requests. Live model checks are explicit: with the verified candidate URL and bridge credential supplied securely in the environment, run `node --use-env-proxy scripts/verify-assistant-live.mjs`. This exercises the real model through an isolated local Worker/D1 kitchen; it uses subscription quota but does not modify production household records. The proxy flag is needed in managed environments that configure an outbound proxy.

## Voice

Recordings are sent to the companion and transcribed using the multilingual Whisper base model running on its CPU. The image contains the model; cold starts do not download it. No OpenAI API key or paid transcription fallback is used. Audio files are private temporary files deleted after success/failure. Input is limited to 8 MiB / 65 seconds and a 90-second transcription deadline. English/Hindi/Hinglish accuracy and mobile microphone formats still need real-device acceptance testing.

## Scheduled work

Cloud Scheduler sends authenticated POSTs to these routes, in `Europe/Amsterdam`:

| Endpoint | Schedule |
| --- | --- |
| `/jobs/recipes` | Daily 09:00 |
| `/jobs/offers-AH` | Friday 14:00 |
| `/jobs/offers-ALDI` | Wednesday 14:00 (provisional retailer publication time) |
| `/jobs/offers-Jumbo` | Saturday 14:00 (provisional publication time) |
| `/jobs/offers-PLUS` | Saturday 14:20 |

Jobs skip unconfigured households and unselected retailers. Bahar Delft is excluded. Recipes can only add proposed suggestions and new recipes; callbacks reject changes to existing plans or shopping. Offer jobs retrieve bounded official pages, pass that evidence to Codex for structured extraction, and validate dates, sources and conditions before writing through the Site. JavaScript-only/blocked pages are recorded as source-unavailable, never as proof of zero offers. The collectors are intentionally conservative and are not yet proven against live retailer campaigns.

## Deployment

1. A project administrator runs `bash scripts/gcp-bootstrap.sh` once in Cloud Shell. This creates dedicated runtime/build/scheduler identities and authorizes the existing workload-identity deployer. No service account keys are created.
2. Install `google-auth` and `requests` in a local venv, using Application Default Credentials. Run `python scripts/deploy-cloud-run.py prepare`.
3. Put the Site's supported service-access bearer credential into Secret Manager secret `onion-site-access` via a secure maintenance session. Do not paste it in chat or commit it. The prepare phase generates the separate `onion-bridge-secret` once.
4. Commit and push `main`, then run the script's `build` and `deploy` phases. Resume existing operation IDs if a build/deployment remains pending.
5. Configure the Site's `BRIDGE_URL` and secret `BRIDGE_SECRET` from the verified service URL and matching Secret Manager version. Publish the Site. Run `schedules`, then set Site `SCHEDULES_CONFIGURED=true` and publish that environment revision. Run `verify`.
6. The owner completes official device login in the app. Verify a completed command, transcription, scheduled callback and a second cold-start request before claiming the integration operational.

For an existing service, deploy with `ONION_CANARY=1 ONION_IMAGE_COMMIT=<built-commit>`. Current serving revisions retain their traffic while the `candidate` tag provides the new revision's test URL. After verifying that candidate, run the `promote` phase with the same `ONION_IMAGE_COMMIT`. Promotion checks the ready candidate matches the tested image before routing traffic to it.

The service URL is printed by a successful deploy, never guessed. Provisioning does not change the Site audience. Current deployment blockers and actual validation are recorded in `docs/VERIFICATION.md`.

## Costs

Minimum zero removes idle instance compute, but active requests, builds, registry/storage and Scheduler can still incur Google Cloud charges. The durable 30/day model-attempt cap and single-instance limit are abuse bounds, **not a €5 hard spending cap**. Check actual billing before claiming that budget. No separately billed OpenAI API is configured.
