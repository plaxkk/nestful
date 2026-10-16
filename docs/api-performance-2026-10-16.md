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
