# Family creation after session refresh

- Symptom: phone preview showed “创建失败，请确认 API 已启动”.
- Evidence: production logs showed POST /v1/families returning 401, a successful
  POST /v1/wechat/session, then POST /v1/families returning 403. The route rejects
  an ownerUserId that differs from the authenticated user. The original source
  of the stale client identity was not established.
- Root cause: the request retry refreshed its token but reused the old family
  ownerUserId and ownerWechatOpenId. The TypeScript refresh path also omitted
  updating the cached user, unlike the shipped JavaScript path.
- Fix: rebuild only family-creation identity fields from the refreshed session
  before retrying; synchronize the TypeScript user cache update. Keep server
  authorization checks. Replace the misleading API-startup toast with a retry
  message.
- Regression: scripts/miniprogram-static-smoke.mjs exercises a stale token and
  different owner identity. The equivalent isolated regression failed before
  the fix (old-user versus real-user), then passed after it.
- Integration: the shipped JS client against an isolated local API returned
  401 -> session 200 -> family 201; both family and owner member matched the
  refreshed authenticated user. No production test family was created.
- Device acceptance: regenerate preview and ask the user to repeat creation.
  The existing DevTools runtime automation previously disconnected, so this
  local API integration does not establish phone-side WeChat acceptance.
