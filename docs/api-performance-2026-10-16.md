# API latency follow-up — 2026-10-16

The user opened the v2 preview and successfully created a family, but reported
several seconds of waiting. Production inspection showed the API running in
`iad1` while its Supabase pooler is in `us-west-2`. The family insert itself
averaged 0.679 ms in `pg_stat_statements`; the delay was dominated by network and
request setup rather than that SQL execution time.

## Changes

- Select `pdx1` in `vercel.json`, matching the database region. Vercel inspection
  verified the deployed API function runs there. Vercel recommends placing
  functions near their data source; its [region list](https://vercel.com/docs/regions)
  maps `pdx1` to `us-west-2`, and [configuration](https://vercel.com/docs/functions/configuring-functions/region)
  supports a single region on Hobby.
- Send `BEGIN; SET LOCAL ROLE nestful_runtime` in one protocol round trip.
  The restricted role still ends at commit/rollback.
- Insert a new family, its first admin, and its audit event through dependent
  data-modifying CTEs in one parameterized statement. Authentication and creation
  together now use 6 database round trips instead of 10. Transactional integrity
  and session validation are preserved.
- Batch the caller's membership families' member reads rather than querying once
  per family. Shared DTOs continue to omit private profile fields.

## Verification

`npm run release:quality-gate` passed all 21 real Postgres/Fastify tests, including
new checks for audit/member atomicity, rollback on invalid references, and batched
membership isolation. Production pooler verification confirmed the batched
transaction enters `nestful_runtime` and cannot create schema objects. The Vercel
production build succeeded; deployment `dpl_6GnjoX3xyYykLkQCqDuYdzbVxGsa` is READY
in `pdx1`. No schema or user-data reset was required.

The same local Node fetch harness made 6 sequential production `/health` requests
before and after deployment, excluding the first 2 as warmup:

| Measurement | Before (`iad1`) | After (`pdx1`) |
| --- | --- | --- |
| All six samples, ms | 1780, 1045, 528, 533, 517, 520 | 1360, 912, 400, 262, 253, 257 |
| Last-four median, ms | 524 | 259.5 |

All responses were 200 with `storage: relational-v2`. Warm median improved about
50%. This is a health-endpoint comparison from the same network, not a measured
phone create-family duration or a guarantee about cold starts and WeChat login.
The existing mini-program preview uses the updated backend without recompiling
or generating a replacement QR code. The user still needs to retry phone flows.

## 2026-10-21 first-open QA follow-up

The user reported that the live mini-program still takes several seconds before
“家庭安排” appears on a first online open. Production measurements from this
machine (proxy/VPN path, so indicative rather than authoritative) showed:

- `x-vercel-id: sfo1::pdx1`: the edge PoP is `sfo1`; the function runs in
  `pdx1`.
- `/health` `server-timing: app;dur=8.5–28.6ms` when warm. Fresh TLS setup was
  0.67–1.09s, TTFB 1.17–1.52s; a keep-alive request was 0.26–0.38s.
- `/v1/me/home` without a bearer returned 401 in 0.28–0.85s.
- `POST /v1/wechat/session` with an invalid code took 0.52–1.03s warm and 2.58s
  on the first request after idle.
- The Supabase pooler host resolves in AWS `us-west-2` (Oregon).

The server-side `/v1/me/home` work is 5 transactions / about 14 SQL statements
for an admin, roughly 30–70ms when the API and database are co-located. The
first-open delay is therefore dominated by network distance and serial request
setup, not SQL execution.

Cold Home previously issued three serial requests when the cached bearer was
stale: `wx.login` → `POST /v1/wechat/session` → `/v1/me/home` → 401 →
session refresh → `/v1/me/home`. The new `POST /v1/me/bootstrap` accepts either
a valid bearer or a fresh `wx.login` code and returns the user plus the complete
selected-family view in one response. The mini-program Home page now uses it;
the legacy endpoints remain for already-released clients.

Local verification on 2026-10-21 passed: typecheck, 37 Postgres/Fastify tests
(including the new bootstrap endpoint group), mini-program JS generation and
smoke, Home startup and flow harnesses, the MVP/design/birthday flow harnesses,
`release:runtime-smoke`, and `release:local-gate`. The endpoint was then
deployed to production on the existing `pdx1` function and verified:
`POST /v1/me/bootstrap` without credentials returns 401 `session_required`,
`/v1/me/home` still returns 401 `unauthorized`, and `/health` returns 200 with
`x-vercel-id: sfo1::pdx1`. No infrastructure has been changed yet:
`vercel.json` is still `["pdx1"]` and the production database is still in
Oregon.

### Step 0 result — 2026-10-22

`/health` now echoes the Vercel geolocation headers (`client` field) so a phone
can report its entry PoP without a debugging proxy. A Shanghai handset on
cellular data with VPN off returned:

```json
{"client":{"vercelId":"sin1::vw4d9-...","country":"CN","region":"SH","city":"Shanghai"}}
```

The edge is already `sin1` (Singapore), so the China → Singapore leg is as short
as Vercel can make it. The remaining distance is entirely inside the request
path: the function runs in `pdx1` and the database in Oregon. Moving both to
Singapore removes those hops and keeps every leg of the request in one region.

For contrast, the same endpoint from this Mac returned
`{"vercelId":"sfo1::...","country":"US",...}` because its egress is a US VPN
exit; that measurement is not representative of the phone and was not used for
the decision.

Stage 1 is confirmed. The next step is the Singapore Supabase project; then
update `DATABASE_URL` and `regions` together in one deployment.

The PostgreSQL 17 client needed to dump the live 17.11 server is built and ready
at `~/.local/pgsql17/bin` (17.11; Homebrew has no bottle for this machine). The
database baseline, rehearsal, cutover, verification, and rollback commands are in
`docs/supabase-singapore-cutover.md`.

### Preview instrumentation — 2026-10-22

Development builds (`envVersion: "develop"`, which includes preview QR codes)
render a small badge on Home with the first-screen time and the bootstrap request
time: `首屏 X.Xs · 请求 YYYms`. It is gated on `develop`, so trial and release
builds never show it. The badge measures `onLoad` to the `setData` callback that
first paints the family dashboard.

Simulator measurements after the Singapore cutover, taken through WeChat DevTools
automation on this Mac (US VPN egress, so every request crosses the Pacific twice
and these are upper bounds, not the phone's numbers):

| Case | Bootstrap request | First screen |
| --- | --- | --- |
| Cold, no stored session (`wx.login` + bootstrap) | 2170 ms | 2.6 s |
| Warm, cached bearer, three runs | 698 / 712 / 459 ms | 0.7 / 0.7 / 0.8 s |

The Shanghai-on-cellular number still has to come from the phone; the preview
install has its own storage, so scanning it reproduces a true first open.
