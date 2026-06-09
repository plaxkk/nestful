# API Contract

This document captures the current API baseline. The MVP implementation uses a local JSON store to stabilize frontend integration before a production database lands.

## Health

`GET /health`

Returns service liveness.

## Authentication

`POST /v1/auth/wechat-login`

Planned phase 1 endpoint. The mini-program sends a `wx.login` code to backend; backend exchanges it through WeChat `code2Session`, binds the `openid` to an internal user, and returns an app session token.

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

## Families

`POST /v1/wechat/session`

Exchanges a mini-program `wx.login` code for the current app-scoped WeChat identity. If WeChat credentials are not configured, development environments return a local fallback identity.

```json
{
  "code": "wx-login-code"
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

Creates a reminder. The creator and optional assignee must be members of the same family.

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

Marks a reminder as completed and records `completedAt`.

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

Lists family activities.

`POST /v1/families/:familyId/activities`

Creates one family activity. The creator must be a member of the same family.

```json
{
  "title": "周末家庭聚会",
  "startsAt": "2026-05-24T02:00:00.000Z",
  "location": "家里",
  "description": "一起吃饭、聊天、看看近况",
  "createdByMemberId": "member-id"
}
```

MVP activities default to `scheduled` and can be shared by copying a family-group friendly text from the mini program.

## Ledger

`GET /v1/families/:familyId/ledger-entries`

Lists MVP household ledger entries. Entries are visible to the family in this MVP.

`POST /v1/families/:familyId/ledger-entries`

Creates one household ledger entry. The payer must be a member of the same family.

```json
{
  "type": "expense",
  "category": "daily",
  "title": "买菜",
  "amountCents": 2000,
  "paidByMemberId": "member-id",
  "occurredAt": "2026-05-21T00:00:00.000Z"
}
```

Supported `type`: `expense`, `income`.

Supported `category`: `daily`, `education`, `health`, `travel`, `housing`, `subscription`, `other`.

## Digital Space

`GET /v1/families/:familyId/digital-space-items`

Lists family digital space items. MVP items can be documents, account notes, or memory-wall entries.

`POST /v1/families/:familyId/digital-space-items`

Creates one family digital space item. The creator must be a member of the same family.

```json
{
  "kind": "memory",
  "title": "一次家庭出行",
  "summary": "周末一起出门散步的记忆",
  "url": "https://example.com/family-memory",
  "createdByMemberId": "member-id"
}
```

Supported `kind`: `document`, `account`, `memory`.

MVP account items are notes only. Do not store real passwords or secret recovery information.

## Audit

`GET /v1/families/:familyId/audit-events`

Lists MVP audit events for family-scoped mutations.
