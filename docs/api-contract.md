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

## Audit

`GET /v1/families/:familyId/audit-events`

Lists MVP audit events for family-scoped mutations.
