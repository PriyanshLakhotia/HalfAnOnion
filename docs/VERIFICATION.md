# Cloud Run integration verification — 10 November 2026

## Recipe capture and suggestion cleanup — 11 November 2026

The live household contained three proposals saved on 10 November at 16:55 Amsterdam time and the same recipe IDs proposed again by the 11 November 09:00 job. Current proposals now display once, new assistant proposals are deduplicated by recipe/name and participants, and accepting/dismissing a displayed card resolves its existing duplicates atomically. No production data cleanup was needed. All five Scheduler jobs were inspected as enabled; offer jobs will skip this household until a retailer store has discovery enabled.

The new first recipe tab accepts photos, free text or voice and saves one structured recipe through the existing subscribed companion. Manual entry remains in the second tab. Meal time and total-servings inputs are removed, with existing saved values preserved. Settings → Assistant shows next scheduled runs using the same schedule declarations as deployment.

Local validation: 74 application tests and 18 companion tests passed, along with TypeScript/contract checks and the production build. Browser QA remains blocked by the computer-use runtime initialization error. The candidate's live image/text/voice verification is recorded separately after deployment testing.

## UI simplification — 10 November 2026

Page headings now contain only their title. The normal sync/slogan bar, navigation icons, empty inspiration panel, decorative recipe covers, and repeated empty-state instructions have been removed. Shopping, recipes, pantry, settings, sign-in, and the assistant composer use shorter labels, neutral surfaces, and readable supporting text. Offline/pending-sync notices, error messages, and functional icon controls remain available.

Validation: TypeScript and generated-contract checks, production Worker build, all 61 application tests, and companion syntax checks passed. Browser visual verification remains unverified: `sites-preview start` could not establish its browser relay, and the computer-use runtime failed to initialize (`the gaas-browser node_repl sandbox cannot be disabled`). No production household data was changed during validation.

Current change: shared typed assistant contracts, validation before writes, one bounded correction attempt, and live model-to-database checks on top of the cold-start-safe Codex companion.

- GitHub `main`: meaningful intermediate commits pushed; no rewritten history.
- TypeScript check and Worker build pass. 61 application/contract/API tests and 16 companion tests pass, including actual D1 saves, all assistant action types, lease fencing, interrupted-request receipts, durable limits, scheduler authorization and proposal-only writes.
- Google project `halfanonion` and the configured workload identity were verified. The owner ran `scripts/gcp-bootstrap.sh`; runtime-service-account attachment, Cloud Run access policy, Secret Manager and Scheduler permissions were then rechecked successfully.
- Direct bucket insertion returned `403 identity_unsupported_request` from the managed identity path. The authorized Cloud Build identity successfully created both private buckets instead. Bucket IAM and object access work normally. Metadata PATCH remains unsupported; existing bucket retention defaults are preserved.
- Managed Sites preview attempted and failed with `relay could not open browser port 4173: timed out waiting for relay readiness`. No browser rendering/microphone/phone verification is claimed.
- Docker image build and isolated runtime smoke checks pass. Codex starts signed out and lists `gpt-6.1-sol`; this is a catalog check, not an entitlement claim. Whisper loads offline and successfully transcribes the upstream Whisper test fixture in about five seconds. `/healthz` returns 200 and unauthenticated assistant/job calls return 401.
- No authoring-machine Codex credential was copied and no OpenAI API key was created. The owner completed the dedicated sign-in. Real subscription-backed turns and model-to-database scenarios now pass, as recorded below. Long-term token refresh, scale-to-zero inference behavior and retailer extraction still require separate live verification.

## Connection repair

A reported Connect ChatGPT failure was traced to Cloudflare Workers rejecting `redirect: "error"` before making the outbound request. All Site-to-companion calls now share `requestBridge`, use `redirect: "manual"`, and explicitly reject 3xx responses without forwarding credentials. The old service worker also cached unversioned `/main.js`; HTML now references content-versioned JS/CSS so a normal navigation bypasses old caches.

31 application tests pass, including streamed device-code delivery, redirect rejection and versioned asset loading. The deployed Site-to-Cloud-Run status probe returns 200 with assistant available and transcription enabled. Direct companion device-code initiation returned the official `auth.openai.com/codex/device` URL; the test login was not authorized. Source fix: `25befcab4b7994451bb3083a3cfd3cd31824e29f`. User account authorization remains to be completed.

## Production deployment

### Typed output and automatic correction

The reported `recipes.origin = inference` and array `prerequisites` errors came from untyped JSON strings inside the model's action schema. `src/domain/assistant.ts` now derives structured outputs from the same Zod entity schemas used for persistence. Typed create/patch/status actions constrain enums, arrays, strings, dates and numeric bounds. Both interactive and scheduled paths accept empty-action replies. Legacy recipe origin/prerequisite representations normalize without losing their text; other invalid responses are rejected without partial writes.

The companion decodes and validates each full batch against a cloned kitchen snapshot before returning it, checks references and edit expectations, and performs at most one correction within the request deadline. The Site validates again before its atomic transaction. Scheduled proposals retain their narrower authorization. Generated `companion/contract.mjs` freshness is checked before building; GitHub Actions now runs the build and both suites on pushes and pull requests. The clean-runner check for source `36934d0334486e0fa37d140aa159a8b77c23fc5e` passed: <https://github.com/PriyanshLakhotia/HalfAnOnion/actions/runs/42846930886>.

Site source `c2c632d5fad10cbc56987f9f79655e6d16b19bbd` deployed successfully with environment revision 3. Cloud Run candidate `half-an-onion-companion-00005-pv4` was tested while normal traffic remained on the previous revision. `scripts/verify-assistant-live.mjs` exercised a real subscribed model through the actual Worker/API and an isolated D1 household: conversational reply (8.2 seconds), recipe/meal/shopping/pantry/preference creation (68.4 seconds, including a successful automatic correction of memory scope), typed recipe edits (9.2 seconds), and a saved recipe proposal (10.5 seconds). Assertions checked the persisted entities, not just a successful HTTP response. No test household records were written to the production Site. The live runner needs `node --use-env-proxy` in this managed environment; omitting the proxy flag caused an initial test-runner network failure before model access.

The final image, source `f4274a8ca7d5bda2d43bd0d74e56ab689669da5b`, additionally keeps correction messages focused on the requested kitchen changes. Candidate revision `half-an-onion-companion-00006-792` passed a targeted real-model creation/save check in 44.7 seconds before promotion, including valid recipe origin/prerequisites, linked meal components, confirmed shopping, pantry and scoped preference records. `ONION_VERIFY_CREATION_ONLY=1` selects this narrower deployment check after the complete scenario suite has passed.

### Text-command repair

The runtime constructor assigned the executable string to `this.command`, shadowing the `command()` method used by text input and scheduled jobs. It now stores the executable in `this.executable`. Three regression tests reproduced `runtime.command is not a function` before the fix and pass afterward, exercising public command dispatch, structured turn results and recovery after a signed-out rejection. All 13 companion tests and syntax checks pass.

Image source `9445a72986d834084df47dee3cdb8924b3f603e2` is deployed as Cloud Run revision `half-an-onion-companion-00004-bjk`. The existing ChatGPT account remained connected. A real authenticated `/command` request using `gpt-6.1-sol` with high reasoning returned HTTP 200 and `status: completed` in 6.8 seconds, with message `Text commands are working.` and zero actions. This verifies an actual subscribed model turn without modifying household records. Cloud Run is Ready, still uses request-based CPU, and still has zero minimum instances. Both fix and verification commits are pushed to GitHub `main`.

### Recoverable device sign-in

Site source `3e5da21e059d364e9e1b5a3cfbf9bcf1fca2bb64` adds Copy code, a selectable code field with clipboard fallback, and Show sign-in code. Hiding the dialog retains the active request and code. A refreshed page can resume the pending login. Cloud Run revision `half-an-onion-companion-00003-xmm`, built from `5950cb16bc218c54761be68e998a1fe855b13013`, shares a pending device login across connection requests instead of competing for its storage lease.

TypeScript, Worker build, 31 application tests and 10 companion tests pass. New tests cover reopening a closed response, identical code replay, completion delivery, expiry/retry and startup failure. Production Site publication succeeded with environment revision 3. Its served versioned JavaScript contains the new controls; both direct companion and Site-to-companion status returned 200. Two live connection requests returned 200 with the same code and expiry, without the busy error; the code was not logged. The unapproved test login then expired normally, and `/status` returned 200 with `login_pending: false`, confirming that the lease was released. Request-based CPU and zero minimum instances remain verified. Browser clipboard interaction and completed user authorization are not claimed by these checks.

### Initial rollout

The final Site publication uses source `4f949a9ca7b7ceb7bec6fe5aa57f5eaae41a7439` and runtime environment revision 3. Server-to-server Site callback access returned 200 for the existing household. A real Cloud Scheduler recipe invocation at 2026-11-10 14:06:20 UTC completed with OK status, exercising Scheduler OIDC, Cloud Run and Site access. Since Codex is signed out, that invocation safely skipped model generation.

All five Cloud Scheduler jobs were created successfully in Europe/Amsterdam: recipes daily at 09:00; AH Friday 14:00; ALDI Wednesday 14:00; Jumbo Saturday 14:00; PLUS Saturday 14:20. A live authenticated transcription request returned 200 and the expected words from the public Whisper fixture in 13 seconds.

Cloud Run: `https://half-an-onion-companion-mhkhubkfza-ez.a.run.app`, revision `half-an-onion-companion-00002-s4k`, image source `7f6f56fa2734ca8f0ca4487a9d3ae116c7c68bab`. Request-based CPU billing is enabled (`cpuIdle: true`), minimum instances zero and maximum one. A signed-out authenticated `/status` request completed in about five seconds, returned the requested model in its catalog and reported the local voice adapter ready. Anonymous `/command` returned 401. The local container startup probe returned 200; the externally requested Cloud Run `/healthz` returned 404, so readiness is verified using Cloud Run's Ready condition and authenticated application requests.

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
