# Acceptance Checklist

## Automated Checks

Run these from the repository root:

```bash
npm run release:quality-gate
```

`release:quality-gate` runs the full local handoff gate by executing `release:local-gate` and then `release:runtime-smoke`.

`release:local-gate` runs release script syntax checks, typecheck, tests, lint, migration smoke, static mini-program smoke, experience preflight, record template check, and experience tooling smoke. It does not start the API server, connect to WeChat DevTools, preview, or upload.

`release:runtime-smoke` starts the API server when needed, runs `acceptance:smoke`, starts WeChat DevTools automation when needed, runs `miniprogram:devtools-smoke`, and cleans up the local API/DevTools instances it started. It does not preview or upload.

Before an approved experience-version upload, also run `npm run experience:preflight -- --check-api-health --health-output docs/experience-version-api-health-<version>.json` from a network that can reach the trial API.

When running the lower-level scripts by hand, start the API and DevTools automation first:

```bash
npm run dev:api
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto --project /Users/kk/repos/nestful --port 9420 --auto-port 9421 --trust-project --disable-gpu
```

Expected smoke output:

```text
acceptance smoke passed
miniprogram devtools smoke passed
```

The smoke script now also verifies:

- local WeChat fallback identity creates an app session token when credentials are not configured
- family creation requires an app session token
- actor-scoped mutations reject tokens that try to impersonate another member
- family creation rejects missing/non-object bodies
- cross-family invitation creation is forbidden
- admins can list, cancel, and inspect invitation lifecycle status
- cross-family direct member creation is forbidden
- expired invitation codes cannot be accepted
- canceled invitation codes cannot be accepted
- used invitation codes cannot be accepted twice
- member list responses redact emergency contacts
- member detail responses expose emergency contacts only to admins or the member themself
- admins can update member roles and remove members
- non-admin members cannot update their own role or list invitation codes
- the last admin cannot be downgraded
- family/invitation mutations create audit events
- birthday/health reminder creation, listing, completion, and recurring next-occurrence scheduling work
- reminders reject invalid dates, cross-family assignees, cross-family notification recipients, invalid subscription authorization, and cross-family completion
- household ledger entry creation, listing, split-member selection, recurring bill reminders, goal funds, and monthly summaries work
- ledger entries reject invalid dates, cross-family payers, cross-family split members, and invalid recurrence settings
- digital-space item creation, listing, kind filtering, account safety warnings, memory timeline metadata, people/place/activity tags, and media metadata work
- digital-space items reject invalid dates, cross-family creators, cross-family people tags, and unsupported media metadata
- family activity creation, listing, detail, RSVP, task assignment, completion, cancellation, and memory linkage work
- activities reject invalid dates, cross-family creators, cross-family participants, RSVP impersonation, and unauthorized completion

Data-layer release checks:

- `nestful_app_state` remains the runtime source of truth while product flows are still changing.
- `services/api/migrations/001_normalized_postgres_up.sql` creates normalized tables and indexes for `family_id`, member references, `due_at`, and `created_at` access patterns.
- `services/api/migrations/001_normalized_postgres_verify.sql` is run on a staging clone and count deltas are reviewed before any table-read cutover.
- `services/api/migrations/001_normalized_postgres_down.sql` rollback is available and leaves JSONB app state untouched.
- `npm run miniprogram:smoke` checks that the local mini-program pages still expose the expected onboarding, invite, reminders, ledger, digital-space, and activity controls.
- `npm run miniprogram:devtools-smoke` connects to the WeChat DevTools automation port, creates a family in the mini-program runtime, generates an invitation, validates the join route, and exercises reminder, ledger, digital-space, and activity page creation flows.

## Mini Program Manual Checks

Mini Program API base URL selection is now environment-aware:

| WeChat envVersion | Default API |
| --- | --- |
| `develop` | `https://nestful.kkplayit.online` |
| `trial` | `https://nestful.kkplayit.online` |
| `release` | `https://nestful.kkplayit.online` |

For local API development, first start the API with `npm run dev:api`, then override the API base URL from the WeChat DevTools console without changing source:

```js
wx.setStorageSync("nestful.apiBaseUrl", "http://127.0.0.1:3100")
```

Clear the override with:

```js
wx.removeStorageSync("nestful.apiBaseUrl")
```

Open WeChat DevTools with:

```text
/Users/kk/repos/nestful
```

Latest local CLI check:

- `cli open --project /Users/kk/repos/nestful --port 9420 --disable-gpu` opened the project successfully after enabling the DevTools service port.
- `cli build-npm --project /Users/kk/repos/nestful --port 9420` reached the current AppID and returned `__NO_NODE_MODULES__`; this is non-blocking because the mini-program does not use a `miniprogramRoot` npm package build.
- `cli auto --project /Users/kk/repos/nestful --port 9420 --auto-port 9421 --trust-project --disable-gpu` enabled DevTools automation.
- `npm run miniprogram:devtools-smoke` passed against SDK `3.16.1` with local API base URL `http://127.0.0.1:3100`.
- `cli auto-replay --project /Users/kk/repos/nestful --port 9420 --replay-all --trust-project --disable-gpu` opened and finished the local replay runner. The repository now uses `npm run miniprogram:devtools-smoke` for repeatable runtime page-flow assertions.
- `cli preview` and experience-version upload are external WeChat artifact actions. They require explicit release approval because they can upload project code and create shareable QR/build artifacts.

Expected setup flow:

1. Home page renders "家庭助手" with only two large choices: "创建我的家庭" and "输入邀请码加入".
2. Tap "创建我的家庭".
3. Create Family page renders one input: "给家庭起个名字".
4. Tap "完成创建".
5. App navigates to the family overview.
6. Family overview shows the family name, member count, and a clear next step: "生成家人邀请码".
7. Tap "生成家人邀请码".
8. Large invitation digits are displayed.
9. Tap "微信发送邀请" and confirm the share card path points to `/pages/join/index?code=...`.
10. Tap "复制邀请码" and confirm the code is copied.
11. Open the join path in DevTools, or tap "输入邀请码加入" on the home page and type the code.
12. Join page shows invitation status, code input, display-name input, and "确认加入家庭".
13. Fill a display name and tap "确认加入家庭".
14. App navigates back to the family page and the member list includes the new family member.

Expected family-task flow:

1. In family overview, "今天要处理" contains entries for birthday/health, activity, memory wall, and ledger.
2. Tap "生日和健康"; create a medicine reminder, choose the family member who needs medicine, choose a frequency such as "每天两次", then confirm it appears as "待提醒".
3. Create an exercise reminder and verify it can target either one member or "全家一起".
4. Create a birthday reminder, choose the member birthday date, select an advance reminder such as "提前 7 天", keep "生日当天也推送" enabled, and verify reminder rows are created for both timing points.
5. Tap "完成" and confirm the reminder status changes to "已完成".
6. Return to the family page and tap "家庭账本".
7. Create one ledger entry with a split member, then confirm it appears in "最近记录" and "本月分摊".
8. Create a subscription or housing expense with "每月续费" or "每年续费", then confirm the row shows "已安排提醒".
9. Create one family goal fund and confirm it appears in "目标进度".
10. Return to the family page and tap "记忆墙".
11. Create one document/account/memory item, verify kind filtering, confirm account items show a password/recovery-secret warning, and confirm memory items can show date, place, people, activity, and media metadata.
12. Return to the family page and tap "家庭活动".
13. Create one activity with a collaboration task, then confirm it appears in "已经发起的活动".
14. Confirm RSVP, add or complete a task, then tap "复制说明" and confirm the group text reflects the activity status.

## WeChat Experience Version Checks

Do not use the WeChat DevTools preview QR code for multi-person family invitation testing. The preview/development QR code is temporary, tied to the current DevTools build, and can show "开发版小程序已过期，请在开发者工具重新扫码" after it expires or after the project is recompiled.

Use `docs/experience-version-invite-validation.md` to record the build, tester accounts, screenshots, and final pass/fail evidence for this section.

Use this rule:

| Situation | Use |
| --- | --- |
| Developer checks on the same machine | DevTools preview QR code |
| Multiple people testing invite/join | WeChat experience version |
| Real family use | Submitted and released official version |

Experience-version setup:

1. In WeChat DevTools, click "上传" after local checks pass.
2. Open the WeChat mini program admin console.
3. Add every tester's WeChat account as an "体验成员".
4. Select the uploaded build as the experience version.
5. Send the experience-version QR code to testers.

Experience-version invite validation:

1. Tester A opens the experience version and creates a family.
2. Tester A generates an invitation code and shares/copies it.
3. Tester B opens the same experience version.
4. Tester B enters the invitation code on "输入邀请码加入".
5. Tester B taps "检查邀请码", enters a display name, and joins.
6. Tester A returns to the family overview and confirms Tester B appears in "家里人".

## Elder-Friendly Manual Checks

Use these checks on the home, family, join, and any new Phase 2 pages before handoff:

| Check | Pass condition |
| --- | --- |
| Font size | Body/helper text is at least 30rpx; page titles are at least 52rpx. |
| Button size | Primary action buttons are at least 100rpx tall; secondary buttons are at least 96rpx tall. |
| Step count | Each page has no more than two main actions in the setup path. |
| Plain language | No visible terms like MVP, module, dashboard, workspace, schema, or role. |
| Error prompts | Toasts say what to do next, e.g. restart API, create family first, ask family to resend invite. |
| Empty states | Missing invitation code shows "缺少邀请码" instead of "待验证". |
| First screen | Home has only two choices: create a family or join by invitation code. |
| Overview | Family overview leads with invite/setup status and "今天要处理", not a dense feature grid. |
| DevTools path | Home -> create family -> family -> invite -> join -> reminders / ledger / digital space / activities can be completed in WeChat DevTools without guessing the next step. |

## Known MVP Boundaries

- Data persists to a local JSON file at `.data/nestful.json`; this is still an MVP stand-in for the target SQL database.
- WeChat login code exchange is implemented for mini-program identity binding when `WECHAT_APP_ID` and `WECHAT_APP_SECRET` are configured; local fallback IDs remain for development.
- Database schema and baseline privacy permissions are documented in `docs/database-schema.md`.
- Birthday/medicine/exercise reminders have a create/list/complete flow with member targeting, reminder plans, due occurrences, medicine/exercise frequency metadata, and birthday advance/day-of reminder rows. Completing recurring reminders creates the next in-app occurrence; WeChat subscription-message sends still require one-time user authorization per occurrence. Real WeChat subscription-message delivery is implemented behind `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, reminder-type template IDs, and a scheduler that calls `/v1/reminders/dispatch-due`. With only the medicine template configured, only medicine reminders request WeChat subscription authorization.
- Ledger has an MVP create/list/split/summary flow with recurring bill reminders for housing or subscription expenses and family goal funds. Fine-grained finance visibility, settlement payments, and export are not implemented yet.
- Digital space has an MVP create/list/filter flow for document notes, account notes, and memory items. Memory rows carry people, place, date, activity, and media metadata; account notes show explicit warnings not to store passwords or recovery secrets. Real file upload, media upload, password storage, and fine-grained visibility are not implemented yet.
- Family activity day has an MVP create/list/detail/RSVP/task/complete/cancel/copy-share-text flow. Completing an activity creates a linked memory item. Calendar sync, payments, and group automation are not implemented yet.
- Group embedded automation is not implemented yet.
- DevTools preview QR codes are temporary and unsuitable for multi-person invite testing. Use an experience version with added experience members for stable internal testing.
- Yellow DevTools warnings about base library or deprecated browser APIs can be ignored for this MVP acceptance.
- `webapi_getwxaasyncsecinfo:fail` is a WeChat DevTools/AppID SDK warning seen during local debugging. The project does not call this API. Treat it as non-blocking if the family, invitation, and reminder flows still work.
