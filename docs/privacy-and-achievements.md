# Navigation achievements and privacy

## Deployment

- Deploy the client build and restart the API together. Registration now requires `termsVersion: "2026-09-27"` and `ageBand: "13plus"` or `"under13"`.
- Existing accounts remain usable. No production balances or achievements are reset.
- Public routes: `/ktga/conditions`, `/ktga/mentions-legales`, `/ktga/confidentialite`, `/ktga/cookies`, `/ktga/parents`. The static host must keep its existing SPA fallback for direct links.
- Publisher: Sean "Bnmkt" Ferrara (individual), contact sean.ferrara@outlook.be. Client hosted by OVHcloud; game server self-hosted. No postal address was invented.
- Regenerate the event reference: `node server/scripts/export-achievement-events.mjs docs/achievement-events.json`.

## Authoring achievements

Admin > Achievements > Create offers page visits, a specific owned object, active minutes and distinct visit days. The visit template can require an equipped shop item, a browser family and an optional link marker. Inventory dropdowns use catalogue IDs, not CSS values.

Example: choose Visit a page, Boutique, the desired equipped object, then an optional `secret` marker `answer-42`. The server emits `site.visit`; the rule combines `page = shop`, `player.equippedItemIds contains ITEM_ID`, and optionally `markers contains secret:answer-42`.

Advanced rules retain AND / OR / NOT groups, comparison operators, counters, sums, maxima and distinct values. Every event now receives a trusted `player` snapshot with owned/equipped catalogue IDs, token balance, account age, favourite game IDs, inventory count and friend count. No birth date, gender, biography, password, email or parent dossier is included.

New events:

| Event | Source |
| --- | --- |
| `account.login` | Successful password login |
| `player.updated` | Successful profile save; only non-sensitive field names |
| `inventory.equipped` | Actual changed equipment slots |
| `inventory.checked` | Login, purchase, equipment/profile save |
| `site.visit` | Consented page category, browser family and allowed marker |
| `site.activity` | Consented, server-timed active interval |

`shop.purchase` remains the purchase event. New metrics: `tokens`, `accountAgeDays`, `friendCount`. Existing game and transaction events continue to work. Deep Thought now uses `site.visit` and `secret:answer-42`; previously earned achievements are preserved. Administrator overrides are not silently rewritten; old overrides for Deep Thought need updating manually if present.

## Collection boundaries

- Essential gameplay/account data does not depend on optional consent.
- Optional navigation tracking is off before consent. Accept and reject have equal prominence. Choice validity: 180 days, versioned and synchronized to the account when authenticated.
- A 13+ age affirmation is required for optional tracking. A known under-13 birth date or parental-account registration prevents enabling it.
- Browser family only; no raw User-Agent saved by this feature. No fingerprint, precise location, referrer, arbitrary query parameters or full URL.
- Only `secret` and `challenge` markers literally declared in enabled achievement conditions are read. Values must be lowercase letters, digits or hyphens, maximum 48 characters. Do not use personal data as markers. Matching markers necessarily reach consenting clients; they are not a security secret.
- The browser sends a heartbeat every 30 seconds while visible, focused and recently interacted with (60-second window). The server uses its own clock, deduplicates signals under 5 seconds, rejects gaps over 45 seconds for time accounting and keeps one clock per account. Hidden/blurred tabs reset the clock. This is approximate active time, not proof of human presence; browser signals can be spoofed and must never authorize money, access or valuable rewards.
- Persisted counters are bounded: cumulative active seconds, visit-day count, last UTC day and at most eight page categories. No visit log or raw query history is stored. In-memory tracking is capped at 10,000 accounts.
- Withdrawing consent clears optional counters and rule progress after successful server synchronization, while earned achievements remain. Other tabs receive local storage updates. Failed synchronization is reported; no local tracking is started. Reopen preferences and submit again to retry.
- Existing technical request logs are separate: method, sanitized route, status, latency, account ID when available, origin and browser family; 14-day retention and 100,000-row limit. Hosting logs/backups require a separate retention review.

## Under-13 parental workflow

1. The parent reads `/ktga/parents` and contacts the publisher by email. No child account or uploaded identity document is collected by the request page.
2. The publisher establishes a proportionate verification method, explains the data and retention, verifies parental authority and records explicit permission including public-profile implications in a separate access-controlled case file. **The application does not verify a person's identity or parental authority automatically.**
3. Admin > Parameters > Parental authorizations: enter a non-identifying case reference, attest completed verification, generate a code. An attestation is an audit record, not a substitute for verification.
4. Deliver the code privately to the verified parent. It expires after 72 hours, can be revoked, is stored only as a SHA-256 hash, and is atomically consumed on registration. At most 100 pending codes. The account keeps a case reference, reviewer ID, version and date, never the code or documents.
5. The registration form requires age band, terms acceptance and, for under-13, the code. Age band is self-declared, not identity verification. Optional navigation tracking remains unavailable for this account. The parent can contact the publisher to request suspension/deletion or withdraw authorization. Use existing account administration to suspend a registered account; revoking an unused code does not suspend an already registered account.

## Before public launch: legal/operational review required

This implementation is not a certification of GDPR or Belgian gambling-law compliance. Virtual, non-purchasable, non-redeemable tokens are the stated model, not a legal classification.

- Confirm whether the publisher's postal address must be disclosed under the applicable Belgian rules; omitting it at the publisher's request does not establish an exemption.
- Confirm the contracted OVH entity, hosting countries, subprocessors, any transfers and contractual safeguards. The website only states the information supplied, without inventing server locations.
- Define and document retention for inactive accounts, backups, correspondence and parental verification evidence, plus an actual rights-request/export/deletion procedure. The existing account/history storage has no automatic inactive-account purge. Published information explicitly distinguishes this from the 14-day application logs.
- Have the under-13 verification method, public-profile exposure and optional achievement incentives reviewed before inviting children. Do not issue codes until actual verification and evidence handling are in place. Navigation achievements must not become a condition for gameplay or token earnings.
- The registration checks apply to new accounts, not an age audit of existing accounts. Guest access remains the existing ephemeral gameplay path; assess its suitability for children separately.
- Keep the legal text, consent version, registration version and actual practices aligned when changing purposes or hosting.

Primary references reviewed:

- [Belgian DPA: consent and the under-13 rule](https://www.autoriteprotectiondonnees.be/professionnel/rgpd-/bases-juridiques/consentement)
- [Belgian DPA: cookies and other trackers](https://www.autoriteprotectiondonnees.be/citoyen/themes/internet/cookies)
- [OVHcloud legal information](https://www.ovhcloud.com/fr/terms-and-conditions/)

## Verification

- `npm.cmd test` in server and client.
- `node client/test/privacy.smoke.mjs` with Playwright available (or `PLAYWRIGHT_MODULE` pointing to its module). Creates isolated SQLite databases and temporary API/client servers, then closes all test processes.
- Integration checks cover API refusal before consent, trusted inventory vs forged payloads, unrelated accounts, parental permission authorization/reuse, private dossier exclusion, legal routes, desktop/mobile layouts, consent withdrawal and the under-13 registration form.
