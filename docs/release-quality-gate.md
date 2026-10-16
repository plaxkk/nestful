# Release Quality Gate

Updated 2026-10-16 for relational v2. Earlier June file-mode and DevTools results
are historical and do not count as v2 phone acceptance.

```bash
npm run release:quality-gate
```

This runs `release:local-gate` and `release:runtime-smoke`. The local gate checks
script syntax, workspace typecheck/test/lint, historical migration smoke,
deployment configuration, generated mini-program JS, transport/event bindings,
and experience-version evidence tooling.

The runtime gate starts a disposable local Postgres instance and exercises the
actual repositories and Fastify routes. All 19 tests passed at cutover. They
cover identity/session concurrency, family isolation, private fields, invitations,
last-admin/version conflicts, foreign keys, expense totals, independent activity
and space modules, idempotent memory snapshots, cursor precision, calendar/lunar
recurrence, per-member completion, notification claims, authorization consumption,
known failures, unknown sends, expiry, and member deactivation.

PostgreSQL 16+ `initdb` and `pg_ctl` must be available on PATH or through
`POSTGRES_BIN_DIR`. `NESTFUL_TEST_ADMIN_URL`, when supplied, must be loopback and
point to a disposable local server. Tests create/drop a unique database and do
not connect to production or call real WeChat services. There is no runtime
file-storage or fake WeChat login fallback.

`npm run miniprogram:build` generates committed JS from TS;
`npm run miniprogram:check-js` detects drift. `npm run acceptance:smoke` uses the
same actual Postgres acceptance suite. The legacy DevTools smoke is not the v2
release gate and its old file-mode fixtures are not current acceptance evidence.

Before deployment, run the Vercel production build and inspect compiler output.
After deployment, verify `/health` returns `relational-v2`, anonymous resource
requests fail, the removed global family directory returns 404, and the scheduler
requires its configured bearer token. See [cutover evidence](v2-cutover-2026-10-16.md).

Phone acceptance remains separate. A preview requires DevTools running and a
valid developer login. Stable two-person invitation testing uses an experience
version with the testers added in the WeChat console. Neither preview generation
nor local tests imply phone acceptance or authorize formal release. Use
[the acceptance checklist](acceptance-checklist.md) and the existing
experience-version evidence template. Formal release waits for user approval.
