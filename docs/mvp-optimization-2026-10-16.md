# MVP optimization execution

Goal: a family member opens a WeChat activity card, joins safely if necessary,
responds, and the organizer sees the response. This is a limited family trial,
not a medicine alarm service or a file/password vault.

## Scope and release boundary

- Preserve individual single-use invites. Add bounded, expiring group invites;
  approval is the default, with explicit admin opt-out. Store hashes only.
- Share a particular activity, preserve the destination across authentication and
  joining, switch to its family, and never expose member/private data to visitors.
- Real dashboard tasks; simple activity creation, editing, cancellation and RSVP.
- Reminder edit/pause and explicit notification states; ledger edit/void;
  usable document links; family leave/archive and privacy/feedback entry.
- Concurrent multi-user repository/API tests and mini-program flow regressions,
  generated JS, local quality gate, production build, API deployment and preview.
- No formal WeChat submission/release. Phone confirmation, account-console
  filing/category/privacy eligibility, real notification receipt and real-family
  retention remain evidence that automation cannot manufacture.

## Design choices

- A family and a WeChat group remain distinct. A forwarded card is not membership.
- Group invitations default to 20 admissions, seven days, admin approval. They
  remain revocable after earlier admissions. Approved admission is idempotent;
  removed members cannot reuse an approved request to silently regain access.
- All invitation/member lifecycle mutations lock family before invitation/request
  rows. Admission limits count approved new memberships, not repeated clicks.
- Activities and digital space remain independent; memory saving is explicit.
- This repository uses hand-maintained numbered SQL migrations and a disposable
  PostgreSQL test runner, not the Supabase CLI migration-history workflow.
  Continue that established runner and keep production changes additive.

## Progress

- [x] Inspect current product, schema, permissions and release workflow.
- [x] Implement and test server capabilities.
- [x] Implement and exercise mini-program user journeys.
- [x] Complete quality gates, deployment, preview and documentation.

Commit/push proof is the accompanying Git history and final delivery response.

## Implemented user experience

- Group invites support multiple distinct members, default approval, seven-day
  validity and 20 admissions. Single-person invites remain. Limits/expiry/revocation
  apply at approval too. Repeated clicks do not consume extra admissions; removed
  members cannot replay an approved request to regain access.
- Exact activity cards preserve destinations through joining and switch to the
  correct family. Only admins can include a family-joining invitation; ordinary
  members share to existing members. The generic thumbnail has no private data.
- Real homepage responses/tasks/reminders and join approvals. Activity creation
  uses date/time pickers and optional details. Organizers edit/cancel and add tasks;
  changed names/times/places require other participants to reconfirm.
- Reminder edit/stop, preserved history and explicit consent/failure/expiry/unknown
  labels. Stopped plans accept no new completions/subscriptions. Provider acceptance
  is not described as proof the recipient read the notification.
- Ledger correction/voiding preserves payer/splits/type and keeps separate recurring
  plans explicit. Repeated save taps cannot duplicate one in-flight ledger save.
- Copyable digital-record links and accurate text/link-only positioning. Family
  rename/exit/archive, last-admin protection, management handoff guidance, privacy,
  feedback/data-request entry and explicit logout are visible.
- Denied family reads clear cached contents/invites; private profile editing closes
  on re-entry, and other members' ordinary profiles are read-only.
- Fixed Vercel gateway query loss: invite codes, cursors and month filters now
  reach Fastify, covered by an entry-handler regression.

## Deployment and data evidence

- Applied `services/api/migrations/006_mvp_collaboration_up.sql` to project
  `qrspwgrkxogbpvrdafnn` using the connected Supabase app. The private `nestful`
  schema now has 23 tables, adding `family_join_requests` and invitation controls.
- Existing data preserved: 2 families, 1 user, 2 memberships before/after migration.
  These are current v2 trial data, not a historical JSON backfill.
- Backup: ignored `.data/private-backups/2026-10-16-before-mvp-collaboration.json`,
  mode 0600; SHA-256 `72f05c3682702dd4b55baef6dd56d48d17ed90a1021a3c0be663c33c364db57e`.
- API `https://nestful.kkplayit.online`, deployment
  `dpl_3iV1JZ2SAnecaJRqw3Mpg6vqK521`; inspect confirms function region `pdx1`.
- Health 200/`relational-v2`; anonymous dashboard/join-request/activity-entry/plan
  reads 401; removed global family directory 404; scheduler without bearer 401.
- Runtime request grants: SELECT/INSERT/UPDATE, no DELETE. Supabase `anon` and
  `authenticated` lack schema usage. Legacy-table permissions were not widened.
- Security advisor reports only the pre-existing informational
  [RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  on retained `public.nestful_app_state`, intentionally inaccessible to ordinary
  Data API callers. No public-read policy was added.

## Validation and limits

- Full quality gate: 30 isolated PostgreSQL/Fastify cases, including concurrent
  admission/approval, expiry/revocation, cross-family references, last-admin,
  pause/archive and Vercel query forwarding.
- Final client follow-up: local gate plus 10 emitted-JS flows, including exact
  object entry, approval continuation, revoked-cache clearing, duplicate-save
  prevention and logout without immediate silent login.
- Vercel production build passed. Official DevTools CLI compiled the preview.
  Final package: 184295 bytes (180.0 KB).
  PNG/JSON artifacts are outside Git in the chat visualization directory, named
  `nestful-mvp-collaboration-preview-2026-10-16`.
- Live simulator screenshots were not inspected: new Codex automation authorization
  timed out (`wait WechatIDE authorization timeout`). The
  [installed guide](/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/wechatide-skill/SKILL.md)
  permits those tools only after its version/login/token gate; this gate was not
  bypassed. The separately authorized traditional CLI preview succeeded.
- No new two-account phone test, real-notification receipt, native feedback
  submission, account-console compliance check or formal release is claimed.
  Feedback uses WeChat's native workflow; deletion/export/archive recovery remain
  manual requests. Compilation and JS tests do not replace phone visual QA.

## Phone acceptance for this preview

1. Two accounts with testing access: A sends a group invite, B applies, A approves,
   B continues. Also test explicit admin opt-out from approval.
2. Share two different activities; B opens each correct card while another family
   is selected, responds, and completes an assigned task.
3. A changes date/place; B must reconfirm. Cancel and reopen an old card.
4. Revoke a pending invite/remove B; old requests must not restore access.
5. Edit/stop reminders; individually authorize and check actual phone delivery.
   Correct/void ledger records and verify summaries.
6. Check long labels, pickers, privacy/feedback and logout. Archive only a disposable
   family; the last administrator cannot exit without handoff.

Formal submission/publication still waits for the user's acceptance.

## Trial measurement

Recruit 5–10 families for two weeks. Track invite-to-join, join-to-first-response,
families with at least two participating members, and voluntary return for the
next arrangement. Do not treat creation count as proof of collaborative value.
No health content, raw invitation tokens or credentials belong in analytics.
