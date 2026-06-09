# TODO

This file is the working task source for turning the current Nestful demo into a usable MVP.

Last updated: 2026-06-09

## Phase 1: Baseline and Developer Experience

- [x] Create a project task source from the Plan Mode evaluation.
- [x] Make the Mini Program API base URL configurable without source edits.
- [x] Sync `README.md`, `docs/api-contract.md`, and `docs/acceptance-checklist.md` with the current auth/API contract.
- [x] Keep `npm test`, `npm run typecheck`, and backend smoke acceptance green after every slice.

## Phase 2: API Hardening

- [x] Extract shared request validation and error-response helpers in the Fastify API.
- [x] Add API tests for negative paths and permission boundaries.
- [x] Standardize 400/403/404 semantics for cross-family actions, missing members, duplicate joins, and expired invitations.
- [x] Expand smoke coverage into family, privacy, reminder, activity, ledger, and digital-space groups.

## Phase 3: Identity and Session Security

- [x] Decide whether to keep `/v1/wechat/session` or migrate to `/v1/auth/wechat-login`.
- [x] Issue an app session token after WeChat login.
- [x] Stop trusting client-supplied actor member IDs without server-side session validation.
- [x] Store token plus current family/member state on the Mini Program client.

## Phase 4: Family and Member Profiles

- [x] Add member detail and edit flows for nickname, role, birthday, lunar flag, location, and emergency contact.
- [x] Limit sensitive profile fields to authorized viewers.
- [x] Add admin flows for role updates and member removal.
- [x] Improve invitation lifecycle: expiration, regeneration, used-state messaging, and resend guidance.

## Phase 5: Reminders

- [x] Model reminder plans separately from individual due occurrences.
- [x] Advance recurring reminders after completion instead of only setting `completedAt`.
- [x] Harden WeChat subscription-message authorization, retry, and dispatch idempotency.
- [x] Verify birthday advance-day, birthday-day, medicine, and exercise flows across day boundaries.

## Phase 6: Activities

- [x] Implement activity participants and RSVP state.
- [x] Add activity detail, task assignment, and activity completion/cancellation.
- [x] Connect completed activities to memory items.
- [x] Keep share-copy text and share-card paths aligned with activity state.

## Phase 7: Memory Wall and Digital Space

- [x] Separate information architecture for documents, account notes, and memories.
- [x] Add memory timeline views with people, place, date, and activity tags.
- [x] Add explicit warnings that account notes must not store passwords or recovery secrets.
- [x] Prepare media metadata flows before real upload/storage integration.

## Phase 8: Ledger

- [x] Add frontend selection and backend validation for split members.
- [x] Add recurring bill reminders and subscription-renewal reminders.
- [x] Add family goal funds.
- [x] Add monthly summaries, category totals, and member split views.

## Phase 9: Data Layer

- [x] Keep JSONB app-state storage stable while product flows are still changing.
- [x] Plan and implement migration from JSONB state to normalized Postgres tables.
- [x] Add indexes for `family_id`, `member_id`, `due_at`, and `created_at`.
- [x] Provide migration verification and rollback steps.

## Phase 10: Release Quality Gate

- [x] Keep automated checks documented and reproducible.
- [x] Run API smoke tests against local API before handoff.
- [x] Run static mini-program page-flow smoke for onboarding, invite, reminders, ledger, digital space, and activities.
- [x] Run WeChat DevTools CLI open, build-npm, automation, and auto-replay checks.
- [x] Run WeChat DevTools runtime page-flow smoke for onboarding, invite, reminders, ledger, digital space, and activities.
- [x] Prepare experience-version invite validation runbook, evidence template, draft generator, and record checker.
- [ ] Run experience-version invite validation with at least two testers before real family testing.
