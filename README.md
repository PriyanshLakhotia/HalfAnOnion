# Half an Onion

A quiet household food app for shared meals, branch-specific shopping, recipes, pantry and editable food preferences.

- [Setup and operations](docs/OPERATIONS.md)
- [Architecture and data rules](docs/ARCHITECTURE.md)
- [Verification and remaining work](docs/VERIFICATION.md)
- [Offer discovery runbook](docs/DISCOVERY.md)
- [Prepared Codex companion](companion/README.md)

```sh
npm ci
npm run check
npm run build
npm test
```

The React client and request-based Worker deploy to ChatGPT Sites. D1 is the shared source of truth. IndexedDB stores device caches and retryable changes; it is not the shared database. The companion is optional and **not deployed or connected** in this release, at the owner's request. Manual food management does not depend on it.

The default requested model is `gpt-6.1-sol` with `high` reasoning. No paid API reasoning fallback exists. Voice uses the separately billed transcription adapter only when a server-side key is configured.
