# Prepared companion — not deployed

This is an isolated native Codex app-server adapter, based on the device-code integration pattern inspected in `PriyanshLakhotia/product-photo-generator` (HOX Lens). It does not reuse Lens's live service, tokens, bucket or account. The owner explicitly chose to leave hosting disconnected.

## Host contract

Use a single instance with a persistent, private `/data` volume and HTTPS ingress. The Dockerfile sets a dedicated `CODEX_HOME=/data/codex`; never mount a personal/desktop Codex auth directory. Configure a random 32+ character `BRIDGE_SECRET` through the host's secret facility. The Site stores the matching secret server-side and talks to the fixed `BRIDGE_URL`. No public route is unauthenticated. Do not run this container on Cloud Run with ephemeral `/data`: that would lose credentials on replacement. A Cloud Run version needs a private durable store and fenced single credential owner as in Lens before it is operational.

The container is pinned to Codex 0.162.1, the version proven by the inspected Lens deployment. `node --check` verifies syntax here; the image and live device login are **not** verified. Choose a current compatible CLI in a future deployment, test its model catalog and complete a real GPT-6.1 Sol/high turn before promotion.

Endpoints accept POST with the shared bearer credential: `/status`, `/models`, `/connect`, `/disconnect`, `/command`. Only the Site's authenticated owner is allowed to access connection endpoints through the app. Members can request ordinary household food operations without receiving any provider credentials. Codex owns device-code authorization, persistence and refresh. Tokens are never returned by these endpoints.

Commands have stable UUID receipts, a single process queue, a 100-second deadline and 30/day attempt guard. An interrupted persisted request is not silently replayed after restart. No general shell, browsing or filesystem tool is exposed. Only completed structured output can be submitted to the Site's validated application service. A separate discovery workflow handles external pages as data.

Before connecting: verify supported account/subscription usage for this household, token renewal/revocation, failure and cancellation behavior, selected model/reasoning, billing limits and actual durable credential persistence across restart. The current chat intentionally did not copy an authentication file or perform live inference using the authoring environment's credentials.

No monthly cost is asserted or service provisioned. The approved ceiling remains €5/month, excluding separately visible transcription billing. An always-on VM and Cloud Run have different idle/persistence economics; confirm a concrete host/cost before deploying.
