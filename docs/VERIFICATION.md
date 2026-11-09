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
