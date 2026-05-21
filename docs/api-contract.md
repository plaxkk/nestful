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

`GET /v1/families`

Lists known family spaces.

`POST /v1/families`

Creates a family space and its owner member.

Current in-memory implementation still accepts `ownerUserId`. After WeChat auth lands, backend should derive the owner from the app session token.

```json
{
  "name": "王家",
  "ownerUserId": "wechat-open-id-or-local-user-id",
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
  "userId": "wechat-open-id-or-local-user-id"
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
  "assigneeMemberId": "member-id"
}
```

Supported MVP types: `birthday`, `medicine`, `exercise`.

`POST /v1/reminders/:reminderId/complete`

Marks a reminder as completed and records `completedAt`.

```json
{
  "actorMemberId": "member-id"
}
```

## Placeholder Phase 2 Reads

`GET /v1/families/:familyId/activities`

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
