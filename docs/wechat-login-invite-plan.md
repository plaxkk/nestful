# WeChat Login and Invite Plan

## Goal

Define the phase 1 technical plan for WeChat login, openid binding, family invitation share cards, and subscription-message authorization.

This plan upgrades the current local placeholder user IDs into a WeChat-native identity flow without changing the product direction already implemented in the mini-program pages.

## Scope

Included in phase 1:
- WeChat login through `wx.login`.
- Backend session exchange through WeChat `code2Session`.
- Bind `openid` to internal `User`.
- Create family using the logged-in user.
- Generate invite share path from backend invitation code.
- Accept invitation after login.
- Request subscription-message authorization only when the user creates a concrete reminder/activity.

Deferred:
- UnionID-based cross-app account graph.
- Phone number binding.
- Official account binding.
- Enterprise WeChat integration.
- Real-time chat or audio/video call auth.

## Login Flow

1. Mini-program calls `wx.login`.
2. WeChat returns a temporary `code`.
3. Mini-program sends `code` to backend: `POST /v1/auth/wechat-login`.
4. Backend calls WeChat `code2Session` with `appid`, `secret`, `js_code`, and `grant_type=authorization_code`.
5. Backend receives `openid`, `session_key`, and optionally `unionid`.
6. Backend creates or updates internal `User`.
7. Backend returns an app session token and safe user profile.
8. Mini-program stores app session token locally and sends it in later API requests.

## API Changes

### `POST /v1/auth/wechat-login`

Request:

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

Implementation notes:
- Do not return `openid` or `session_key` to the client.
- Store `session_key` encrypted if it must be retained.
- Use app session token for internal authorization.

### Existing endpoint changes

`POST /v1/families`

Current MVP payload has `ownerUserId`. After login integration, backend should derive owner user from token:

```json
{
  "name": "王家",
  "ownerDisplayName": "King"
}
```

`POST /v1/invitations/:code/accept`

Backend should create the member under the logged-in user:

```json
{
  "displayName": "妈妈"
}
```

## Data Model Changes

Add `WechatIdentity`:

```ts
interface WechatIdentity {
  id: string;
  userId: string;
  appId: string;
  openid: string;
  unionid?: string;
  sessionKeyEncrypted?: string;
  createdAt: string;
  updatedAt: string;
}
```

Add `UserSession`:

```ts
interface UserSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}
```

Family membership stays scoped by `familyId` and `userId`.

## Invite Share Card Flow

1. Admin/member taps "生成成员邀请".
2. Client calls `POST /v1/families/:familyId/invitations`.
3. Backend returns:
   - invitation code
   - mini-program join path, e.g. `/pages/join/index?code=abc123`
4. `onShareAppMessage` returns:
   - `title`: `加入王家`
   - `path`: backend-provided `joinPath`
5. Invitee opens share card.
6. Join page loads invitation metadata.
7. Invitee logs in if needed.
8. Invitee fills display name and accepts.
9. Backend creates `FamilyMember` under invitee's logged-in user.

## Invite Rules

- Invitation code must be random, opaque, and non-sequential.
- Invitation can have expiry time.
- Phase 1 allows one-time invitation code by default.
- Later versions can support reusable family invite links with admin controls.
- Existing family members cannot accept the same family invite twice.

## Subscription Message Strategy

Use subscription messages as explicit, scene-based reminders.

Phase 1 scenes:
- Birthday or anniversary reminder.
- Activity reminder.
- Medicine reminder.
- Exercise reminder.
- Bill reminder.

Frontend flow:
1. User creates or enables a reminder.
2. Client calls `wx.requestSubscribeMessage` with the relevant template IDs.
3. Client sends authorization result to backend.
4. Backend stores consent state by user, template ID, scene, and related resource ID.
5. Reminder scheduler sends message only for accepted templates and specific related events.

Rules:
- Do not request all templates on first launch.
- Do not treat subscription messages as a broadcast channel.
- If user rejects authorization, keep in-app reminder visible and allow re-request at the next relevant action.
- Template IDs must be environment-specific config, not hardcoded in page files.

## Environment Config

Required backend env:

```env
WECHAT_APP_ID=
WECHAT_APP_SECRET=
SESSION_TOKEN_SECRET=
```

Required mini-program config:

```ts
const subscribeTemplateIds = {
  birthday: "...",
  activity: "...",
  medicine: "...",
  exercise: "...",
  bill: "..."
};
```

## Security and Privacy

- Never expose `openid` or `session_key` to the mini-program.
- Hash session tokens in storage.
- Short expiry for app sessions, with refresh strategy added later.
- Permission checks must use internal `userId` plus `familyId`, not user-provided member IDs alone.
- Invitation acceptance should validate invite availability and prevent duplicate membership.
- Subscription authorization records are user consent records and should be deletable when users leave a family or delete account.

## Implementation Tasks

1. Backend auth module
   - Add `POST /v1/auth/wechat-login`.
   - Add WeChat client for `code2Session`.
   - Add user/session store abstraction.

2. Mini-program login utility
   - Add `loginWithWeChat`.
   - Store app session token.
   - Add token header to API requests.

3. Family flow update
   - Remove local placeholder user IDs from page logic.
   - Create family and accept invitation using logged-in session.

4. Invite card update
   - Keep `joinPath` backend-generated.
   - Improve share title and optional image later.

5. Subscription consent
   - Add template ID config.
   - Add consent request helper.
   - Add backend endpoint to save consent result.

## References

- WeChat Mini Program login overview: <https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html>
- WeChat `wx.login` API: <https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html>
- WeChat `code2Session` API: <https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html>
- WeChat share forwarding: <https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html>
- WeChat subscription messages: <https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html>
- WeChat `wx.requestSubscribeMessage` API: <https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html>
