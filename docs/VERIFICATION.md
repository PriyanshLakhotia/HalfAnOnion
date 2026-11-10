# Cloud Run integration verification — 10 November 2026

Current change: cold-start-safe Codex companion, streamed device sign-in, self-hosted Whisper, daily recipe proposals, weekly official-store extraction and protected Site callbacks.

- GitHub `main`: meaningful intermediate commits pushed; no rewritten history.
- TypeScript check and Worker build pass. 26 domain/API tests and 7 companion tests pass, including lease fencing, interrupted-request receipts, durable limits, scheduler authorization and proposal-only writes.
- Google project `halfanonion` and the configured workload identity were verified. Runtime/Scheduler deployment is **not complete**: `iam.serviceAccounts.actAs`, Cloud Run access-policy changes, Secret Manager and Cloud Scheduler permissions are missing. `scripts/gcp-bootstrap.sh` prepares the required identities and access.
- A real bucket-creation attempt also returned `403 identity_unsupported_request` from the managed outbound identity path. No bucket or Cloud Run service was created by that failed request. This may require environment identity support or running the checked-in deployment script in authorized Cloud Shell after IAM setup; an IAM grant alone has not been proven to resolve it.
- Managed Sites preview attempted and failed with `relay could not open browser port 4173: timed out waiting for relay readiness`. No browser rendering/microphone/phone verification is claimed.
- No existing Codex credential was read or reused, no OpenAI API key was created, and no live model request was made. The owner still needs to complete the dedicated sign-in after hosting is available. Model availability, token refresh, real cold-start persistence and retailer extraction require live verification.

The earlier release record below is historical; its intentionally disconnected hosting and paid transcription descriptions are superseded by this change.

---

# Verification record — 9 November 2026

## Proven in this environment

`npm run check`, `npm run build`, `npm test`: **25 passing tests** against the domain layer and an actual Miniflare Worker/D1 instance (no live household test records). Companion JavaScript syntax checks also pass.

Coverage: two independent username/password sessions; one household; single-use and revoked invitations; anonymous/foreign-household denial; CSRF denial; owner-only invitation/AI connection management; idempotent operation replay; simultaneous purchase and another member's addition; expected-field conflict handling; undo refusing another member's later edit; proposal acceptance distinct from purchase; unmarked AI additions defaulting to proposals; automatic meal grocery reconciliation; grocery quantity scaling without duplicate shared portions; rerun/dismissal suppression; forgotten-memory suppression; participant authorization; allergy checks; variant/unit/branch distinctions; Amsterdam date/DST boundaries; time-commitment thresholds; Bahar exclusion; offer date/source/freshness/personal-offer rejection; export excluding credentials; honest disconnected-AI state and no paid reasoning fallback.

Incremental GitHub main milestones: runnable foundation, durable household services, UI/offline queue, and prepared AI/discovery adapters, followed by verification repairs. Original history and configured author preserved. GitHub is a non-fork repository with main as its default branch. No promise is made about contribution-graph timing or account-email association beyond the repository's configured author.

## Deployment

The private production URL is https://half-an-onion.techstuff19.chatgpt.site. The initial publication succeeded and the live D1 overview confirms all seven application tables. Production logs show household state requests without an app session returning 401. The native publication screenshot captured the loading state only; it does not validate completed app rendering.

## Unverified or intentionally disconnected

- The owner requested the companion be prepared **without deploying it**. No live subscription login, refresh, entitlement, GPT-6.1 Sol/high inference or completed AI tool-action scenario has been claimed. The adapter follows the inspected Lens app and current official app-server device-code documentation; syntax is not an integration proof.
- No transcription API key is configured. English/Hindi/Hinglish speech and ingredient recognition, provider failures and actual microphone formats require live testing on both target phone platforms. No browser-only speech-recognition substitute is presented as complete.
- Sites preview failed: `relay could not open browser port 4173: timed out waiting for relay readiness`. The shared desktop browser also failed: `the gaas-browser node_repl sandbox cannot be disabled`. Managed-preview instructions prohibit replacing that infrastructure with another browser path. No real screenshots, interaction review, keyboard/reflow review or installation checks were completed. Responsive CSS is implemented, not visually verified.
- The offline queue and service worker are implemented, with transactional server replay tested. Actual IndexedDB, service worker update, reload offline, multi-tab and network-reconnection behavior has not been verified in a browser.
- No production household has been seeded; first-use account creation is for the owner. Thus the deployed two-person signup/invite journey and onboarding duration remain to be exercised.
- Offer writer and source validation are implemented; no fabricated offer data exists. AH/PLUS schedules and Jumbo validity were rechecked. ALDI extraction and recurring timing remain unverified; Jumbo preview day remains provisional. A connected Site MCP writer, selected stores and a successful fresh scheduled run are required before calling discovery operational. No automatic browser process is embedded in the Worker.
- New personalized recommendations depend on the disconnected assistant; no fake suggestions are seeded. Store discovery uses official finder links plus manual branch entry, not an in-app location search service. Recipe links can be saved; automatic recipe-page extraction is not implemented.
- There are no push notifications; optional alerts remain off. Restore tooling is conservative: it restores recipe/store/pantry/memory/meal fields and active groceries into the same existing household; it does not restore account credentials, deleted/expired/dismissed proposals, or membership. Existing grocery lifecycle is left intact; missing bought items are recreated then marked purchased.

## Hosting access constraint

The requested username/password-only access for the invited member requires a publicly reachable app sign-in shell. All food APIs remain authenticated and household-scoped. Automatic approval review rejected changing the Site's owner-only audience to public, citing lack of explicit authorization to broaden access and the earlier private-allowlist requirement. The app can be published owner-private for review, but the second member cannot pass that hosting boundary until the user explicitly approves the publicly reachable sign-in page (or chooses Sites-authenticated allowlisting instead).

## Acceptance run still required

After enabling the chosen hosting audience and connecting optional services, run the brief's full two-session scenario with real accounts: shared dal/rice dinner, speaker-only chicken lunch, paneer at Bahar; verify inferred groceries are proposals; accept/dismiss; buy offline while another session edits; reconnect; retrieve a sourced active offer; refine a suggestion; repeat Hindi/Hinglish; disconnect AI and repeat manual operations. Record model, reasoning, timestamps, device/browser versions, actual screenshots and production scheduler run IDs. Test signup, expiry/revocation, password/session renewal and installation on physical iPhone Safari and Android Chrome. Do not upgrade this record to “complete” based only on successful deployment.
