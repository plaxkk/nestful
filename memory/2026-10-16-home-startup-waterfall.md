# Home startup on a high-latency network

- A visually small Home used four requests: memberships, dashboard, admin
  applications and next-activity details. The first two were serial and the
  final detail read added a third network round trip.
- Current production remained in pdx1; typical SQL execution was sub-2 ms.
  Successful request logs and slow TLS/HTTP probes pointed to multiplied
  network/setup latency, not missing database indexes.
- Combine Home reads server-side through existing authorized repositories.
  Do not trade authorization for public views or a shared response cache.
- A short in-memory return window needs user/token/family checks and explicit
  invalidation after successful writes; otherwise creating an activity and
  immediately returning can show a stale Home.
- `scripts/home-startup-performance.mjs` fails against the old client. Its
  one-request assertion is more dependable than an absolute timing threshold.
- Fixed-150 ms transport reproduction: complete view 454 ms before, 152 ms
  after. These controlled results must never be presented as actual phone
  measurements. Use response Server-Timing for future live diagnosis.
