# API Contract — relational v2

Deployed 2026-10-16. The executable contract is
`services/api/src/routes-v2.ts`; repository DTOs define returned fields.
The old local-file API and global JSONB state are no longer runtime paths.

## Common rules

- Send `Authorization: Bearer <app-session-token>` on every private request.
  The server derives the actor from that session and checks active membership.
- `ownerUserId`, `ownerWechatOpenId`, `userId`, `wechatOpenId`,
  `createdByMemberId`, and `actorMemberId` must not be submitted as actors.
  Business references such as payer, participant, and assignee IDs are validated
  against the same family.
- Single-resource responses use `{data: ...}`. Paginated lists return
  `{data: [...], nextCursor: ...}`; follow the cursor until it is absent.
  Reminders, activities, ledger entries, funds, space, and audit support
  `limit` (default 50, max 100) and opaque `cursor`. Family memberships,
  members, and invitations currently return simple arrays.
- IDs are UUIDs. Dates are ISO timestamps. Money uses integer `amountCents`.
- Versioned edits require the currently displayed `version`; conflicts return
  409. Validation returns 400, missing authentication 401, forbidden access 403,
  missing resources 404. Domain errors use `{error: "code"}`.

## Health and identity

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/health` | Checks database access; 200 includes `storage: relational-v2`, unavailable storage returns 503. |
| POST | `/v1/wechat/session` | Accepts `{code}` from real `wx.login`, binds app ID/OpenID to a stable UUID user, and returns token, expiry, user and compatibility identity fields. No fake-login fallback. |
| POST | `/v1/wechat/logout` | Revokes the current session. |
| GET | `/v1/me/families` | Returns only the caller's memberships. |

Login tokens and invitation codes are stored as hashes. OpenID, where returned
for compatibility on the caller's login response, is not the application's user
ID or an authorization credential. No WeChat session key is stored or returned.
`/v1/auth/wechat-login` is not an implemented endpoint.

## Families

The routes below use `/v1/families/:familyId` as their base unless shown fully.

| Method | Route | Input / behavior |
| --- | --- | --- |
| POST | `/v1/families` | `{name, ownerDisplayName}`; creates family and authenticated first admin atomically. |
| GET | base | Family detail for an active member. |
| GET | `/members` | Shared member profiles, without private profile fields. |
| GET | `/members/:memberId` | Private fields only for that member or an admin. |
| PUT | `/members/:memberId` | Versioned profile edit. Role is `admin` or `member`; independent `identityTag` is `elder`, `child`, `guest`, or null. |
| DELETE | `/members/:memberId` | `{version}`; deactivates membership and preserves history. Last active admin is protected. |
| POST | `/invitations` | Admin creates a single-use invitation; optional `expiresAt`. Returns raw code only on creation. |
| GET | `/invitations` | Admin reads lifecycle metadata, not stored raw codes. |
| DELETE | `/invitations/:invitationId` | Admin cancels invitation. |
| GET | `/v1/invitations/:code` | Public bearer-code preview: minimal family name and availability only. |
| POST | `/v1/invitations/:code/accept` | Authenticated `{displayName}`; binds the caller, with concurrent acceptance protection. |

There is no global `GET /v1/families` directory or direct/offline member creation.
All formal members join through WeChat login. Private profile fields are
`emergencyContact` and `privateNotes`; admin actions cannot be forged in a body.

## Reminders

| Method | Route | Input / behavior |
| --- | --- | --- |
| GET | `/v1/reminders/subscription-config` | Available template configuration; public. Optional `/:type` selects a supported reminder type. |
| GET / POST | family base + `/reminders` | List occurrences or create a plan and its first occurrence. |
| PUT | family base + `/reminder-plans/:planId` | Versioned schedule edit with `enabled`; preserves past occurrence history. |
| POST | `/v1/reminders/:reminderId/complete` | Completes only the authenticated member's participation. |
| POST | family base + `/reminders/:reminderId/subscription` | `{templateId, subscriptionStatus}`; authorizes only the caller's next eligible notification. |
| GET / POST | `/v1/reminders/dispatch-due` | Scheduler bearer secret required; generates occurrences and claims due delivery tasks. |

Creation uses `type`, `title`, `dueAt`, optional `frequency`, `schedule`,
`assigneeMemberId`, `targetScope`, `targetMemberIds`, and
`notificationSubscription`. Family scope is one shared plan with independent
member participation. Calendar generation is independent of completion. Birthday
advance/day-of sends are separate delivery tasks for the birthday occurrence.
Subscription acceptance is consumed for one notification; it is not a permanent
recurrence permission. Delivery can be `unknown`; provider acceptance is not
proof of reading or device delivery.

## Activities and independent digital space

| Method | Family-base route | Input / behavior |
| --- | --- | --- |
| GET / POST | `/activities` | List/create activity with title, startsAt, optional location, description, participants, budget and tasks. |
| GET | `/activities/:activityId` | Activity, RSVP and tasks. |
| POST | `/activities/:activityId/rsvp` | `{rsvp}` for the caller; no submitted actor member ID. |
| POST | `/activities/:activityId/tasks` | `{title, assigneeMemberId?}`; creator/admin. |
| PUT | `/activities/:activityId/tasks/:taskId` | `{status, version}`; authorized task completion. |
| PUT | `/activities/:activityId/status` | `{status, version}`; completed/canceled state changes. |
| POST | `/activities/:activityId/save-memory` | Creator/admin explicitly saves a completed activity as an immutable memory snapshot; idempotent. |
| GET / POST | `/digital-space-items` | Independent list/create; list supports `kind`. |

Space creation accepts `kind`, `title`, optional summary, URL, occurrence date,
place, tagged members and media metadata. It does not require an activity. A
submitted `activityId` is rejected: use the explicit activity save-memory route.
Completing an activity does not automatically create a space item. File upload
and password/secret storage are outside this release.

## Ledger and audit

| Method | Family-base route | Input / behavior |
| --- | --- | --- |
| GET / POST | `/ledger-entries` | List/create with type, category, title, amountCents, paidByMemberId, occurredAt, optional splitMemberIds and recurrence. |
| PUT | `/ledger-entries/:entryId` | Versioned entry edit; exact split totals enforced at commit. |
| DELETE | `/ledger-entries/:entryId` | `{version}`; void entry without deleting its history. |
| GET | `/ledger-summary` | Optional `month=YYYY-MM`; uses family time zone. |
| GET / POST | `/ledger-goal-funds` | Manual savings-progress records. |
| PUT | `/ledger-goal-funds/:goalId` | Versioned title, target/current cents and optional due date. |
| GET | `/audit-events` | Admin-only append-only audit metadata. |

Income has no splits. Expense shares sum exactly to the entry amount. Recurring
bill reminders are separate plans and are not silently rewritten by editing an
entry. Goal funds do not transfer or hold real money.
