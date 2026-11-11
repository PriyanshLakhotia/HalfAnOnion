# Architecture

## Runtime

React + TypeScript compile into a single Cloudflare Worker ES module with embedded, same-origin UI/PWA assets. The supplied environment exposed Sites documentation but not the documented initializer/build/source helper files; this repository implements the documented minimum Worker artifact format directly. `scripts/build.mjs` and `scripts/package.mjs` produce `.openai/hosting.json`, `dist/server/index.js` and schema migrations in the deployment archive. The GitHub and Sites remotes retain identical source commits.

Seven D1 tables hold accounts, households, sessions, invitations, operation receipts, connection metadata and rate limits. Each household's typed food entities form a bounded JSON aggregate with an optimistic SQL version. This keeps a compound meal/list edit atomic without distributed infrastructure. D1 `batch` atomically commits the version-checked state and its idempotency receipt. Conflicts re-read and retry up to five times. A patch's expected old fields prevent overwriting a change to the same field; unrelated fields/records can merge.

## Identity

The app serves a sign-in shell; the current Sites audience remains owner-only pending explicit public-access approval. Food APIs require a revocable, Secure, HttpOnly, SameSite=Strict cookie containing a 256-bit random token; only its SHA-256 hash is stored. Passwords use bcrypt cost 12. Usernames are case-normalized, 3–30 ASCII letters/digits/underscores; passwords require 12 characters and are bounded to bcrypt's 72 UTF-8 bytes. Auth and mutation endpoints enforce method, same-origin requests and rate limits. Accounts and invites determine household scope on the server, never a caller-supplied household ID.

Only first-time owner bootstrap uses the verified Sites ChatGPT identity matching `BOOTSTRAP_OWNER_EMAIL`. This establishes the right to create the app's first household. Thereafter the owner and invited members use app usernames/passwords. No email is sent and no email service is provisioned. Invite secrets are single-use, hashed, expire after 48 hours and can be revoked. Redemption and membership insertion are atomic. The platform identity also restricts scheduled MCP discovery to the Site owner. It is independent of both app login and AI subscription authorization.

## Food semantics

`src/domain/model.ts` is the shared validation/transition layer for manual controls and assistant actions. Proposals, confirmed groceries, purchased items, dismissed items and expiry are separate states. Accepting a proposal never marks it bought. Assistant additions default to proposals; only explicit instruction provenance confirms a new item. Meal and recipe edits automatically recalculate pending recipe groceries, retiring superseded proposals while preserving accepted groceries. Confirmed items survive offer expiry and meal changes. Pending recipe proposals expire after their final planned meal day, or when a referenced meal is removed. Dismissal is retained under the recipe/ingredient campaign key. Grocery recalculation uses component servings once, scales against recipe base servings, and does not combine brands, variants, branches or units. Packets are never guessed into grams. Existing confirmed matches are retained; exact pantry depletion and merging quantities across independent manual entries are intentionally conservative.

Pantry `have` is recent confidence for 3 days; `usual` never means current availability. No automatic consumption, exact inventory or shelf-life inference. Durable memory has explicit/tentative provenance and person/household scope. Forget retains a suppression tombstone; it is not sent to the model as a positive preference. Ignored proposals and a purchase do not automatically create taste preferences. Allergies/exclusions remain hard constraints. Dietary validation is conservative metadata/name matching, not allergen certification: unknown recipes require human review and the assistant is instructed to clarify unknown egg/dairy eligibility.

Amsterdam civil dates are stored as `YYYY-MM-DD`, independent of server timezone. Date increments occur at UTC noon solely for civil-date arithmetic. Time commitments: Low ≤20 total minutes; Medium 21–45; High >45. Active minutes and prerequisites stay separate.

## Sync and offline

Visible tabs poll every 5 seconds and after focus/reconnection. Each device records an operation UUID and creation time in IndexedDB before showing an optimistic change. Replay verifies the signed-in account and household, processes changes in creation order, and uses a browser lock where supported. Idempotency receipts prevent duplicate effects if several tabs race. Conflicts stay visible and can be discarded; they are not silently overwritten. Cache and queued changes are cleared on sign-out or account switch. Offline access is to data already saved on that trusted device; first-time login requires a connection.

The service worker caches only the app shell, never API responses or auth routes. Each build changes its cache ID. A new worker activates after old app windows close; the app announces an available update. Browser/phone execution of this path remains unverified because the environment's browser failed to start.

## Assistant isolation

`src/server/ai.ts` separately adapts inference and transcription. The Worker sends household context and the signed-in actor to an authenticated HTTPS companion. The companion uses the Lens app's Codex app-server device-code pattern with a dedicated persistent credential directory. Shell, arbitrary execution, browsing and extra agents are disabled in inference. The selected model and reasoning level must exist in the returned catalog; no substitution is allowed. Only a completed turn's bounded structured actions reach the transactional domain service. Failed/interrupted turns cause no writes. Broad destructive changes require manual review. Provider/account administration is owner-only.

The companion is prepared but disconnected. Its structured output and device login have not been tested against a live subscription here. GPT-6.1 Sol/high entitlement and renewal remain unverified. Audio is not sent through the subscription adapter: recording posts directly to the Worker transcription route and uses `gpt-4o-mini-transcribe` only with an explicitly configured API key. Audio stays in request memory, is never written to R2 or a local file, and is released at request end (including failures). Max recording 60 seconds; max upload 8 MiB; 20 transcription attempts/household/day.

Recent activity/undo is bounded to 100 entries and 30 days, pruned on writes and hidden on reads. Quiet households may retain expired activity at rest until their next mutation; a production maintenance job should be added before promising strict time-based deletion. Operation receipts contain only actor, digest, generic result and timestamp and remain for replay safety. Companion request results expire after 24 hours; its hourly sweeper runs only while the service is alive. Durable preferences remain until edited/forgotten.

## Recipe ownership and meal ideas

Recipes have a collection independent of their editing method: `ours` for manual/photo/text/voice additions, `suggested` for AI drafts, `saved` for explicitly saved AI suggestions, and `dismissed` for declined drafts. AI edits preserve ownership. The model cannot set or patch the collection; only the manual `save-recipe` operation can promote a draft. Planning does not save a recipe. Saves/dismissals are version checked and undoable.

The recipe page separates Our recipes and AI suggestions; saved AI recipes retain a small source label. Legacy recipes created alongside suggestion records are classified as drafts on read/mutation, without deleting their content. Existing capture/manual recipes remain owned by the household.

Suggestions are typed `recipe`, `restaurant`, or `meal`. Only recipe ideas reference recipes and undergo ingredient compatibility checks. Restaurant ideas carry optional location/URL and plan an `eating-out` meal without recipe components or inferred groceries. Generic meal ideas plan an undecided meal. Restaurant dietary suitability must be checked with the venue; the assistant must not invent verified hours, prices or allergy guarantees.

Assistant context excludes unaccepted recipes and suggestion records from both entity dictionaries and activity. Accepted plans may include the recipes needed to cook them, still marked unsaved. Saved recipes remain available. Scheduled output deduplication runs against full stored state, so hidden proposals do not become duplicate records or orphan recipe cards.
