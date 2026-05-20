# API Contract

This document captures the phase 1 API baseline. The current implementation is in-memory and intended to stabilize frontend integration before the database schema lands.

## Health

`GET /health`

Returns service liveness.

## Families

`GET /v1/families`

Lists known family spaces.

`POST /v1/families`

Creates a family space and its owner member.

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

`POST /v1/families/:familyId/members`

Adds a member directly. This is useful for admins and test data; normal WeChat onboarding should use invitations.

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

## Invitations

`POST /v1/families/:familyId/invitations`

Creates an invitation for a family share card.

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

## Placeholder Phase 1 Reads

`GET /v1/families/:familyId/reminders`

`GET /v1/families/:familyId/activities`
