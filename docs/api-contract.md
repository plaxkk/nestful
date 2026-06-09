# API Contract

This document captures the current API baseline. The MVP implementation uses a local JSON store to stabilize frontend integration before a production database lands.

## Health

`GET /health`

Returns service liveness.

## Authentication

`POST /v1/auth/wechat-login`

Planned hardening endpoint. The mini-program will send a `wx.login` code to the backend; the backend will exchange it through WeChat `code2Session`, bind the `openid` to an internal user, and return an app session token.

```json
{
  "code": "wx-login-code"
}
```

Response:

```json
{
  "data": {
    "token": "app-session-token",
    "user": {
      "id": "internal-user-id",
      "nickname": "微信用户"
    }
  }
}
```

Do not expose `openid` or `session_key` to the mini-program.

Current MVP implementation uses `POST /v1/wechat/session` as a transitional identity endpoint. It returns a `userId`, an optional `wechatOpenId`, whether production WeChat credentials are configured, and an app session token that the Mini Program sends as `Authorization: Bearer <token>` on later requests. The next identity hardening pass should either replace it with `/v1/auth/wechat-login` or keep it as a compatibility alias after stronger actor validation exists.

Actor-scoped mutations require `Authorization: Bearer <token>`. When a request includes fields such as `createdByMemberId`, `actorMemberId`, or `paidByMemberId`, the backend validates that the token user can act as that member before applying family-level permission checks.

## Families

`POST /v1/wechat/session`

Exchanges a mini-program `wx.login` code for the current app-scoped WeChat identity and creates an app session. If WeChat credentials are not configured, development environments return a local fallback identity plus token.

```json
{
  "code": "wx-login-code"
}
```

Response:

```json
{
  "data": {
    "userId": "wechat-open-id-or-local-user-id",
    "wechatOpenId": "wechat-open-id",
    "configured": true,
    "token": "app-session-token",
    "expiresAt": "2026-07-09T00:00:00.000Z",
    "user": {
      "id": "wechat-open-id-or-local-user-id",
      "wechatOpenId": "wechat-open-id",
      "nickname": "微信用户",
      "createdAt": "2026-06-09T00:00:00.000Z"
    }
  }
}
```

`GET /v1/families`

Lists known family spaces.

`POST /v1/families`

Creates a family space and its owner member.

The mini-program uses `POST /v1/wechat/session` to exchange a WeChat login code, then passes `ownerUserId` and `ownerWechatOpenId` when creating the family.

```json
{
  "name": "王家",
  "ownerUserId": "wechat-open-id-or-local-user-id",
  "ownerWechatOpenId": "wechat-open-id",
  "ownerDisplayName": "King"
}
```

`GET /v1/families/:familyId`

Returns one family.

## Members

`GET /v1/families/:familyId/members`

Lists family members.

Sensitive fields such as `emergencyContact` are redacted in list responses.

`GET /v1/families/:familyId/members/:memberId`

Returns one member profile. Requires `Authorization: Bearer <token>`. Sensitive fields such as `emergencyContact` are visible only to an admin in the same family or to that member themself.

`PUT /v1/families/:familyId/members/:memberId`

Updates one member profile. A member can update their own display name, birthday, birthday calendar, location, and emergency contact. Admins can update those fields for family members and can also update roles. The final admin in a family cannot be downgraded.

```json
{
  "displayName": "妈妈",
  "role": "elder",
  "birthday": "1965-03-12",
  "birthdayCalendar": "lunar",
  "location": "上海",
  "emergencyContact": "13800000000"
}
```

`DELETE /v1/families/:familyId/members/:memberId`

Removes one member. Requires an admin in the same family. The final admin in a family cannot be removed.

`POST /v1/families/:familyId/members`

Adds a member directly. This is useful for admins and test data; normal WeChat onboarding should use invitations.

```json
{
  "createdByMemberId": "admin-member-id",
  "displayName": "妈妈",
  "role": "elder",
  "birthday": "1965-03-12",
  "birthdayCalendar": "lunar",
  "location": "上海",
  "emergencyContact": "13800000000"
}
```

## Invitations

`POST /v1/families/:familyId/invitations`

Creates an invitation for a family share card.

The creator must be an admin member in the same family.

```json
{
  "createdByMemberId": "member-id",
  "role": "member",
  "expiresAt": "2026-06-01T00:00:00.000Z"
}
```

Response includes `joinPath`, which the mini-program share card can use:

```json
{
  "data": {
    "invitation": {},
    "joinPath": "/pages/join/index?code=abc123"
  }
}
```

Invitations default to a 24-hour expiration when `expiresAt` is omitted.

`GET /v1/families/:familyId/invitations`

Lists invitations for a family. Requires an admin in the same family. Responses include `status` and `joinPath`.

Supported `status`: `active`, `accepted`, `expired`, `canceled`.

`DELETE /v1/families/:familyId/invitations/:invitationId`

Cancels an unused invitation. Requires an admin in the same family. Canceled invitations cannot be accepted.

`GET /v1/invitations/:code`

Returns invitation metadata.

`POST /v1/invitations/:code/accept`

Accepts an invitation and creates a member.

```json
{
  "displayName": "哥哥",
  "userId": "wechat-open-id-or-local-user-id",
  "wechatOpenId": "wechat-open-id"
}
```

## Reminders

`GET /v1/families/:familyId/reminders`

Lists birthday and health reminders for the family.

`POST /v1/families/:familyId/reminders`

Creates a reminder plan plus its first due occurrence. The creator, optional assignee, target members, and notification recipient must be members of the same family.

```json
{
  "type": "medicine",
  "title": "提醒妈妈吃药",
  "dueAt": "2026-05-22T00:00:00.000Z",
  "createdByMemberId": "member-id",
  "assigneeMemberId": "member-id",
  "targetScope": "member",
  "targetMemberIds": ["member-id"],
  "frequency": "daily_twice",
  "schedule": {
    "targetLabel": "妈妈",
    "frequencyLabel": "每天两次",
    "timesOfDay": ["08:00", "20:00"]
  },
  "notificationSubscription": {
    "templateId": "wechat-subscribe-template-id",
    "recipientMemberId": "member-id",
    "subscriptionStatus": "accept"
  }
}
```

Supported MVP types: `birthday`, `medicine`, `exercise`.

Reminder targeting and scheduling:

- `medicine` should target one family member and can use `once`, `daily_once`, `daily_twice`, `daily_three_times`, or `weekly`.
- `exercise` can target `member` or `family`; family-targeted reminders include all current member IDs in `targetMemberIds`.
- `birthday` targets one member and uses `schedule.birthdayDate`, `schedule.advanceDays`, and `schedule.notifyOnDay`. The mini-program creates separate reminder rows for advance-day and birthday-day notifications when both are enabled.

If `notificationSubscription.subscriptionStatus` is `accept` and the recipient member has a `wechatOpenId`, the reminder is queued for one WeChat subscription-message notification. Other statuses keep the reminder visible in-app but skip external notification.

Reminder rows are due occurrences linked by `planId`. Recurring frequencies advance as follows after completion:

- `daily_once`, `daily_twice`, and `daily_three_times` create the next pending occurrence from `schedule.timesOfDay`; if no times are supplied they move forward one day.
- `weekly` moves forward seven days.
- `yearly` moves forward one year, which covers both birthday advance-day and birthday-day reminders.
- `once` does not create another occurrence.

WeChat Mini Program subscription messages are treated as one-time authorizations. Completing a recurring reminder creates the next in-app occurrence, but the next occurrence will not auto-send a WeChat subscription message until a future UI explicitly refreshes authorization.

`GET /v1/reminders/subscription-config`

Returns whether the backend has a reminder subscription template configured.

```json
{
  "data": {
    "enabled": true,
    "templateId": "wechat-subscribe-template-id"
  }
}
```

`GET /v1/reminders/subscription-config/:type`

Returns the configured subscription template for one reminder type. With only the medicine template configured, `medicine` returns `enabled: true` while `birthday` and `exercise` return `enabled: false`.

Current default WeChat template mappings:

- Medicine: `short_thing1` eat time, `thing2` medicine name, `thing3` usage/frequency, `short_thing4` dosage.
- Birthday: `thing1` member name, `time2` birth date.
- Exercise: `thing1` project, `thing2` time, `thing4` plan, `thing5` frequency, `thing6` single exercise amount.

`POST /v1/reminders/:reminderId/complete`

Marks one reminder occurrence as completed, records `completedAt` and `completedByMemberId`, and advances the linked reminder plan when the frequency is recurring. Repeating the same completion request is idempotent and does not create duplicate next occurrences.

```json
{
  "actorMemberId": "member-id"
}
```

`GET /v1/reminders/dispatch-due`

Scans due reminders and sends pending WeChat subscription-message notifications. If `CRON_SECRET` or `NESTFUL_CRON_SECRET` is set, callers must pass either `Authorization: Bearer <secret>` or `?secret=<secret>`.

```json
{
  "data": {
    "due": 1,
    "sent": 1,
    "failed": 0,
    "skipped": 0,
    "notConfigured": 0
  }
}
```

## Activities

`GET /v1/families/:familyId/activities`

Lists family activities with participants, tasks, share path, and share-copy text.

`GET /v1/families/:familyId/activities/:activityId`

Returns one activity detail with participants, tasks, share path, and share-copy text.

`POST /v1/families/:familyId/activities`

Creates one family activity. The creator, participants, and task assignees must be members of the same family.

```json
{
  "title": "周末家庭聚会",
  "startsAt": "2026-05-24T02:00:00.000Z",
  "location": "家里",
  "description": "一起吃饭、聊天、看看近况",
  "createdByMemberId": "member-id",
  "participantMemberIds": ["member-id", "member-id-2"],
  "tasks": [
    {
      "title": "准备水果",
      "assigneeMemberId": "member-id-2"
    }
  ]
}
```

MVP activities default to `scheduled`. The creator is added as an `accepted` participant; other participants start as `pending`.

`POST /v1/families/:familyId/activities/:activityId/rsvp`

Updates the current member's RSVP state. A member cannot RSVP on behalf of another member.

```json
{
  "actorMemberId": "member-id",
  "memberId": "member-id",
  "rsvp": "accepted"
}
```

`POST /v1/families/:familyId/activities/:activityId/tasks`

Adds an activity task. The actor must be the activity creator or a family admin.

```json
{
  "actorMemberId": "member-id",
  "title": "订家庭视频会议",
  "assigneeMemberId": "member-id"
}
```

`PUT /v1/families/:familyId/activities/:activityId/tasks/:taskId`

Updates a task status to `open` or `done`. The activity creator, an admin, or the task assignee can update it.

`PUT /v1/families/:familyId/activities/:activityId/status`

Updates an activity to `completed` or `cancelled`. Completing an activity creates one `digital-space` memory item linked by `activityId` and returns `memoryItemId` on the activity. Share-copy text and share-card paths include the activity status and activity ID.

## Ledger

`GET /v1/families/:familyId/ledger-entries`

Lists household ledger entries newest first. Entries are visible to the family in this MVP.

`POST /v1/families/:familyId/ledger-entries`

Creates one household ledger entry. The payer and every split member must belong to the same family. `recurrence` is optional and only allowed for expense entries in `housing` or `subscription`; it creates a recurring in-app `bill` reminder for the next renewal.

```json
{
  "type": "expense",
  "category": "subscription",
  "title": "家庭会员",
  "amountCents": 2000,
  "paidByMemberId": "member-id",
  "splitMemberIds": ["member-id", "another-member-id"],
  "occurredAt": "2026-05-21T00:00:00.000Z",
  "recurrence": "monthly"
}
```

Supported `type`: `expense`, `income`.

Supported `category`: `daily`, `education`, `health`, `travel`, `housing`, `subscription`, `other`.

Supported `recurrence`: `monthly`, `yearly`.

`GET /v1/families/:familyId/ledger-summary?month=YYYY-MM`

Returns a monthly ledger summary with `incomeCents`, `expenseCents`, `balanceCents`, sorted expense `categoryTotals`, member split rows, and the family's goal funds.

`GET /v1/families/:familyId/ledger-goal-funds`

Lists family goal funds.

`POST /v1/families/:familyId/ledger-goal-funds`

Creates a family goal fund. The creator must be a member of the same family.

```json
{
  "title": "家庭旅行基金",
  "targetAmountCents": 100000,
  "currentAmountCents": 25000,
  "createdByMemberId": "member-id",
  "dueAt": "2026-10-01T00:00:00.000Z"
}
```

## Digital Space

`GET /v1/families/:familyId/digital-space-items`

Lists family digital space items. MVP items can be documents, account notes, or memory-wall entries.

Optional query:

- `kind=document|account|memory` filters one information architecture lane.

`POST /v1/families/:familyId/digital-space-items`

Creates one family digital space item. The creator must be a member of the same family.

```json
{
  "kind": "memory",
  "title": "一次家庭出行",
  "summary": "周末一起出门散步的记忆",
  "url": "https://example.com/family-memory",
  "createdByMemberId": "member-id",
  "activityId": "activity-id",
  "occurredAt": "2026-06-09T00:00:00.000Z",
  "place": "上海",
  "taggedMemberIds": ["member-id"],
  "mediaItems": [
    {
      "kind": "image",
      "label": "散步合照",
      "url": "https://example.com/family-memory.jpg"
    }
  ]
}
```

Supported `kind`: `document`, `account`, `memory`.

Memory items can carry people tags, place, occurred date, activity linkage, and media metadata before real upload/storage integration lands. `activityId` is optional and is used to connect completed family activities to memory-wall entries. MVP account items are notes only and return a `securityWarning`; do not store real passwords, verification codes, recovery keys, or secret answers.

## Audit

`GET /v1/families/:familyId/audit-events`

Lists MVP audit events for family-scoped mutations.
