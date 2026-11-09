# Automatic offer discovery

The Site exposes owner-authorized MCP tools `discovery_context` and `save_discovered_offers`. Publication creates a private Site plugin. A scheduled cloud task needs that plugin connected to call the writer; knowing the URL is not authorization. The app has no manual offer or price-entry UI.

Each retailer workflow first reads `discovery_context`. If the household is not set up, or the retailer is not selected with discovery enabled, stop without browsing. Never browse Bahar Delft. When selected, collect only relevant offers from the official sources. Prefer structured feeds when actually available; otherwise browse the official folder/pages. Use a bounded 8-minute run, at most 3 source requests plus one delayed retry near publication; no daily expensive browsing. Compare cached campaign dates before extraction. A changed or missing source is not proof of no offers.

Use `save_discovered_offers` only for evidence retrieved during the run. Include actual product/variant, discount terms, quantity condition, start/end dates, source URL, fetched timestamp, national/branch/channel scope and loyalty/activation requirements. Unknown price may stay null. If actual dates are unavailable, omit that offer. Never infer local stock from a national folder or use personal Bonus Box/Jumbo Extra's. Each offer's stable key includes retailer/product/campaign. Old accepted shopping items remain even after their linked price claim expires. Only active, recently retrieved offers are shown as current.

Separate statuses: `success`, `not-yet-published`, `source-unavailable`; offer lifecycle derives upcoming/active/expired from actual dates and stale from retrieval age. Run failure does not erase the last successful result. The writer validates dates, fresh evidence, official host allowlist and personal-offer exclusion. No source result has yet been ingested into a real household.

## Publication timing, Europe/Amsterdam

| Retailer | Publication | Validity | Evidence status |
|---|---|---|---|
| AH | Friday around 13:00; collect after 14:00 | Usually Monday–Sunday; actual campaign dates govern | Official recurring, rechecked 9 Nov 2026 |
| ALDI | Wednesday observed; use as provisional collection window | Campaign-specific, usually Monday main cycle | Recurrence unverified; public pages returned no readable content in this check |
| Jumbo | Saturday provisional | Wednesday–Tuesday | Validity rechecked; publication recurrence not confirmed |
| PLUS | Saturday before Wednesday | Wednesday–Tuesday | Official recurring, rechecked 9 Nov 2026 |
| Bahar Delft | None | None | Shopping only, excluded |

Sources:
- https://www.ah.nl/klantenservice/ah-bonus/bonusfolder
- https://www.aldi.nl/aanbiedingen-volgende-week.html and https://www.aldi.nl/folders.html
- https://www.jumbo.com/service/faq/assortiment-en-aanbiedingen-2
- https://plus-consumentenservice.custhelp.com/app/answers/detail/a_id/1275/related/1
- https://plus-consumentenservice.custhelp.com/app/answers/detail/a_id/336

Scheduling requires a created household, selected stores and a connected writer. The initial empty household has none selected. Native scheduled jobs must be verified from a fresh cloud task; a saved schedule alone is not a successful production collection. See the final verification record for actual deployment/schedule state.
