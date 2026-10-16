# Acceptance Checklist

## Automated Checks

Run `npm run release:quality-gate`. The v2 gate uses disposable real Postgres and
actual Fastify routes; it does not start DevTools or create WeChat artifacts.
All 19 relational tests passed at cutover. See
[release gate](release-quality-gate.md) and [cutover evidence](v2-cutover-2026-10-16.md).
There is no fake WeChat login or local-file database fallback. Phone acceptance
must use real WeChat accounts and the matching v2 client.

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

V2 preview status is recorded in the cutover evidence. Historical DevTools
checks are not current phone acceptance. Open the project, log in, and enable
Settings → Security → Service Port before running an authorized preview. The
current Electron CLI discovers its own service port; do not force the historical
9420 port or the old installation-path override.

Expected setup flow:

1. Home page renders "家庭助手" with only two large choices: "创建我的家庭" and "输入邀请码加入".
2. Tap "创建我的家庭".
3. Create Family page renders one input: "给家庭起个名字".
4. Tap "完成创建".
5. App navigates to the family overview.
6. Family overview shows the family name, member count, and a clear next step: "生成家人邀请码".
7. Tap "生成家人邀请码".
8. A selectable invitation token is displayed; it is not a numeric PIN.
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
4. Create a birthday reminder, choose the member birthday date, select an advance reminder such as "提前 7 天", keep "生日当天也推送" enabled, and verify one birthday occurrence has separate advance/day-of notification tasks.
5. Tap "完成" and confirm only the current member is complete; another recipient remains pending. Verify future occurrences appear by schedule without completing the previous one.
6. Return to the family page and tap "家庭账本".
7. Create one ledger entry with a split member, then confirm it appears in "最近记录" and "本月分摊".
8. Create a subscription or housing expense with "每月续费" or "每年续费", then confirm the row shows "已安排提醒".
9. Create one family goal fund and confirm it appears in "目标进度".
10. Return to the family page and tap "记忆墙".
11. Create one document/account/memory item, verify kind filtering, confirm account items show a password/recovery-secret warning, and confirm memory items can show date, place, people, activity, and media metadata.
12. Return to the family page and tap "家庭活动".
13. Create one activity with a collaboration task, then confirm it appears in "已经发起的活动".
14. Confirm RSVP, add or complete a task, then tap "复制说明" and confirm the group text reflects the activity status. Complete the activity and verify no memory is created automatically; explicitly save it as memory twice and verify only one snapshot exists.

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

- Production uses 22 relational tables in private `nestful`, not the historical
  JSONB or local-file store. The early-data reset retains a private backup and
  old JSON record for recovery; v2 starts with newly created records.
- All formal members require WeChat login. Admin/member permissions are separate
  from elder/child/guest tags. Two accounts must verify self/admin private-profile
  visibility and that a different family cannot read or mutate these resources.
- Recurrence is calendar driven. Each member completes their own participation.
  Each subscription authorization covers one eligible notification. Unknown
  provider results are not blindly retried; accepted sends do not prove reading.
- Expenses use exact integer-cent splits. Goal funds are manual progress entries;
  settlement payments, exports and fine-grained finance visibility are not built.
- Digital space works independently. Activities create a memory only through an
  explicit idempotent save action. Uploading files/media and storing passwords
  or recovery secrets are not supported.
- Preview QR codes are temporary. Stable multi-person testing uses an experience
  version with added testers. Formal release requires user acceptance.
