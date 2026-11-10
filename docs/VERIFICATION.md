# Cloud Run integration verification — 10 November 2026

Current change: cold-start-safe Codex companion, streamed device sign-in, self-hosted Whisper, daily recipe proposals, weekly official-store extraction and protected Site callbacks.

- GitHub `main`: meaningful intermediate commits pushed; no rewritten history.
- TypeScript check and Worker build pass. 27 domain/API tests and 7 companion tests pass, including lease fencing, interrupted-request receipts, durable limits, scheduler authorization and proposal-only writes.
- Google project `halfanonion` and the configured workload identity were verified. The owner ran `scripts/gcp-bootstrap.sh`; runtime-service-account attachment, Cloud Run access policy, Secret Manager and Scheduler permissions were then rechecked successfully.
- Direct bucket insertion returned `403 identity_unsupported_request` from the managed identity path. The authorized Cloud Build identity successfully created both private buckets instead. Bucket IAM and object access work normally. Metadata PATCH remains unsupported; existing bucket retention defaults are preserved.
- Managed Sites preview attempted and failed with `relay could not open browser port 4173: timed out waiting for relay readiness`. No browser rendering/microphone/phone verification is claimed.
- Docker image build and isolated runtime smoke checks pass. Codex starts signed out and lists `gpt-6.1-sol`; this is a catalog check, not an entitlement claim. Whisper loads offline and successfully transcribes the upstream Whisper test fixture in about five seconds. `/healthz` returns 200 and unauthenticated assistant/job calls return 401.
- No existing Codex credential was read or reused, no OpenAI API key was created, and no live model request was made. The owner still needs to complete the dedicated sign-in in Settings → Assistant. Model availability, token refresh, real cold-start persistence and retailer extraction require live verification.

## Connection repair

A reported Connect ChatGPT failure was traced to Cloudflare Workers rejecting `redirect: "error"` before making the outbound request. All Site-to-companion calls now share `requestBridge`, use `redirect: "manual"`, and explicitly reject 3xx responses without forwarding credentials. The old service worker also cached unversioned `/main.js`; HTML now references content-versioned JS/CSS so a normal navigation bypasses old caches.

31 application tests pass, including streamed device-code delivery, redirect rejection and versioned asset loading. The deployed Site-to-Cloud-Run status probe returns 200 with assistant available and transcription enabled. Direct companion device-code initiation returned the official `auth.openai.com/codex/device` URL; the test login was not authorized. Source fix: `25befcab4b7994451bb3083a3cfd3cd31824e29f`. User account authorization remains to be completed.

## Production deployment

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
