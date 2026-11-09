# Setup and operations

## First use

1. Open the deployed Site and choose **Owner setup with ChatGPT** once. That uses Sites identity solely to restrict initial account creation to the owner. Choose **Set up our kitchen**, a kitchen name, your display name, username and password. There is no email confirmation or email delivery service.
2. Complete your dietary profile: diet, eggs/dairy, allergies and preferences. Your girlfriend completes her own profile after joining; nobody is silently assigned a diet.
3. Settings → Our stores → Add store. Name the actual branch and locality. Known retailers have store-finder links. Add Bahar Delft as a custom store; it is automatically excluded from offers.
4. Settings → Create invite. Send the link yourself. It expires in 48 hours and works once. Your partner chooses a username/password without signing into ChatGPT. Use Revoke for an outstanding invitation.
5. Add meals, recipes or groceries immediately. Grocery suggestions from the week's recipe components remain proposals until accepted. Click the circular purchased control only when an item is bought.

The owner bootstrap email is stored as a server secret. It is not used for account notifications and is not included in client assets. Keep both passwords in a password manager; email-based reset is intentionally absent. If an owner password is lost, a server-side administrative reset is required through an authorized maintenance session. This first release does not expose a password reset endpoint.

## Phones

- iPhone: open in Safari → Share → Add to Home Screen.
- Android: open in Chrome → menu → Install app/Add to Home Screen.
- Sign in online once before shopping offline. A small status indicator reports queued changes. Keep the app open briefly after reconnecting until it says up to date. A conflicting change stays visible with a discard control.
- Microphone permission is requested only on deliberate tap after transcription is configured. Tap again to stop, review/correct the transcript and submit. Recording ends after 60 seconds. Browser speech recognition is not used as the sole transcription path.
- Close all app windows and reopen to activate a downloaded update. Signing out clears the local household copy and warns if unsynced changes would be discarded.

Phone installation, on-screen keyboard, actual offline replay and microphone behavior require physical Android/iPhone checks. Desktop Chromium was unavailable in this environment; screenshots have not been visually reviewed.

## Connect the household AI later

See [companion setup](../companion/README.md). Hosting was explicitly left disconnected. Do not copy Lens or desktop authentication files. Deploy an isolated companion with persistent private storage, TLS and `BRIDGE_SECRET`. Configure matching `BRIDGE_URL`/`BRIDGE_SECRET` as Sites runtime secrets and redeploy the saved version. Only the owner then uses Settings → Assistant → Connect ChatGPT. Complete the official device-code ceremony. The companion persists and refreshes its own session; no other member receives the provider token.

Choose a catalog model and applicable thinking level. The requested default is `gpt-6.1-sol`, high. Run a completed test request before claiming entitlement. A failed/revoked connection leaves manual functions available. No API reasoning fallback or paid reasoning key path is implemented.

Voice is a separate optional connection. Use the OpenAI Developers plugin's secure key workflow to configure `OPENAI_API_KEY` as a Site secret; do not paste keys in chat or the app. Transcription has separate API charges. No key is currently configured.

## Memory

Settings → Preferences lets either member add/edit household or person-specific food preferences and forget a fact. Profile allergies/exclusions are separate. Forgetting suppresses matching future learned facts; clearing recent activity does not forget preferences.

## Export, restore and migrations

Settings → Data → Export JSON downloads food records, member display profiles and recent activity. It excludes passwords, sessions, invite tokens and provider credentials. Keep exports private.

To restore a food record into the **same household**, use the authenticated application operations endpoint with the exported entity's appropriate `put` or `patch` action. For a patch include current values in `expected`; for a removed record use a new UUID. Apply recipes/stores before meals/items that reference them. Use the same member IDs and remap obsolete references deliberately. `scripts/restore.mjs` performs this against an authenticated same-household export, with a dry-run by default; it refuses a different household. It does not restore passwords or overwrite membership. Review its proposed changes before `--apply`.

For complete database recovery, retain a platform D1 backup containing the relational tables; JSON food exports are not backups of authentication. This chat's tools expose read-only D1 inspection, not a verified production database restore operation. Do not treat a source rollback as a data rollback.

Generate schema changes with `npm run db:generate`; inspect and commit SQL plus `drizzle/meta`. Never edit an applied migration. The preview runner applies missing SQL locally using its migration ledger. Sites publication applies migrations before Worker upload. A failed deployment may still have applied migrations: inspect the database before repairing migrations. Keep schema changes backward compatible with the previous Worker.

## Publish

Run `npm ci`, `npm run check`, `npm run build`, `npm test`, and `npm run check --prefix companion`. Commit and push to GitHub `main` using the configured author. Preserve `origin` and `sites` remotes. Use the official Sites source workflow when installed; otherwise `scripts/publish-source.mjs` accepts a fresh credential on hidden stdin and pushes the same commit without persisting its token. `node scripts/package.mjs` packages the already-built `dist` tree. Save the exact pushed SHA plus archive with Sites, then deploy the saved version. Never force-push or change project IDs.

Site access must permit the username/password sign-in shell without a ChatGPT login gate. Application APIs enforce household authorization. Do not expose test fixtures in production; no household data is seeded.

## Costs and monitoring

No additional hosting was provisioned. The companion has no current hosting bill because it is not running. A future host must be approved within the €5/month ceiling; a container definition is not a price guarantee. Reusing a personal computer requires it to stay awake and is not an always-available deployment. The companion caps commands at 30/day in memory and each turn at 100 seconds; infrastructure billing limits must still be enforced separately, especially across restarts. Transcription usage is separately billed and bounded in D1. No email delivery service is used.

The UI reports source failures separately from empty offers. The server logs only route and error class, not request bodies or tokens. Check Site Worker logs for HTTP failures, D1 tables for persisted household state and the app's offer-source panel for last collection status. Do not claim scheduler health from a local invocation alone.
