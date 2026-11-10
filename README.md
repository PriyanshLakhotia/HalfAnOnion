# Half an Onion

A quiet household food app for shared meals, branch-specific shopping, recipes, pantry and editable food preferences.

- [Setup and operations](docs/OPERATIONS.md)
- [Architecture and data rules](docs/ARCHITECTURE.md)
- [Verification and remaining work](docs/VERIFICATION.md)
- [Offer discovery runbook](docs/DISCOVERY.md)
- [Cloud Run Codex companion](companion/README.md)

```sh
npm ci
npm run check
npm run build
npm test
```

The React client and request-based Worker deploy to ChatGPT Sites. D1 is the shared source of truth. IndexedDB stores device caches and retryable changes; it is not the shared database. The companion is prepared for request-based Cloud Run with zero minimum instances; it is deployed in `halfanonion` / `europe-west4`. Connect a dedicated ChatGPT session in Settings → Assistant. Manual food management does not depend on it.

The default requested model is `gpt-6.1-sol` with `high` reasoning. No paid API reasoning fallback exists. Voice uses a self-hosted multilingual Whisper model in the companion; it does not need an OpenAI API key.
