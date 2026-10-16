# Home startup latency investigation

## Debug report

**Symptom:** The user reported a long wait opening the daily-home preview.

**Root cause:** The redesigned Home waited for membership restoration before
requesting its dashboard. It then requested the activity detail separately and
also requested administrator applications. On each short return it fetched the
dashboard again. A membership network failure could start a second legacy
request, extending the timeout. This multiplied latency on an already slow
network path.

**Evidence:** The currently deployed API was READY in `pdx1`, still alongside
the database region. Live local HTTPS probes returned health 200 in 1.168 s
(TLS complete at 0.720 s) and anonymous membership 401 in 0.887 s (TLS at
0.529 s). These are this computer's observations, not phone measurements.
Database statement statistics averaged 0.530 ms for sessions, 1.168 ms for
membership-related queries, 0.679 ms for activities and 0.487 ms for reminders.
The recent request logs showed successful 200 responses for the user's reads;
the error-level entries inspected were Node deprecation warnings, not failed
API responses. Statistics are historical aggregates, not per-request traces.

The original emitted client reproduced four requests and sequential waiting in
a controlled test with each network round trip fixed at 150 ms:

| Controlled measurement | Before | After |
| --- | --- | --- |
| Requests for complete Home | 4 | 1 |
| First meaningful dashboard | 303 ms | 152 ms |
| Activity details complete | 454 ms | 152 ms |

This isolates the client request-chain overhead. It is not a claim of a
152 ms production/phone launch. Actual latency still includes transport,
server cold start and initial/renewed WeChat authentication when required.

## Fix

- Add authenticated `GET /v1/me/home` combining memberships, selected-family
  dashboard, its next activity detail and admin application count. Existing
  repositories retain authorization checks and safe DTOs. A requested family
  must belong to the caller; fallback only selects another valid membership.
  Ordinary members never receive administrator application counts or private
  profile fields. Responses explicitly use `private, no-store`.
- Home uses the combined response directly rather than chaining the older
  endpoints. Failed startup reads no longer trigger another slow legacy read.
- Returning within 30 seconds reuses the current in-memory page only when
  user, valid token, family and data revision still match. Successful writes
  invalidate reuse; failed writes do not. Explicit refresh always requests
  current data. No cross-user/disk dashboard cache was added.
- Preserve stale-request guards, explicit logout and existing group/activity
  context. Add a non-sensitive `Server-Timing: app;dur=...` response header to
  separate future server processing from total network time.
- No schema, credentials, database region or user-data changes are required.

## Verification and remaining acceptance

- The new startup regression failed on the old emitted client (zero combined
  requests instead of one), then passed with the fix.
- Thirty-four isolated PostgreSQL/Fastify cases passed, including four new
  bootstrap cases for authentication, private fields, unauthorized/archived
  families, empty membership and ordinary versus administrator views.
- The existing ten MVP flows, fourteen daily-home flows and five new startup
  checks passed, as did the local quality gate and generated-JS checks.
- Phone/network acceptance remains external: scan the replacement preview,
  compare first open and a quick return, create/respond to an activity and
  confirm fresh content, and test switching families.

Status: code and regression verification complete; real phone timing requires
the user's follow-up. Production deployment and replacement preview evidence
are recorded with the delivery in this conversation.
