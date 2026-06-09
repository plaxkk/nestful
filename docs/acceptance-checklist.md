# Acceptance Checklist

## Automated Checks

Run these from the repository root:

```bash
npm run typecheck
npm run acceptance:smoke
```

The API server must be running before `acceptance:smoke`:

```bash
npm run dev:api
```

Expected smoke output:

```text
acceptance smoke passed
```

The smoke script now also verifies:

- cross-family invitation creation is rejected
- member list responses redact emergency contacts
- family/invitation mutations create audit events
- birthday/health reminder creation, listing, and completion work
- household ledger entry creation and listing work
- digital-space item creation and listing work
- family activity creation and listing work

## Mini Program Manual Checks

The current local API address for WeChat DevTools is:

```text
http://192.168.18.150:3100
```

If the Mac network address changes, update `apps/miniprogram/utils/api.js` and `apps/miniprogram/utils/api.ts`.

Open WeChat DevTools with:

```text
/Users/kk/repos/nestful
```

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
4. Return to the family page and tap "家庭账本".
5. Create one ledger entry, then confirm it appears in "最近记录".
6. Return to the family page and tap "记忆墙".
7. Create one document/account/memory item, then confirm it appears in "已经放好的东西".
8. Return to the family page and tap "家庭活动".
9. Create one activity, then confirm it appears in "已经发起的活动".
10. Tap "复制群里说明" and confirm a family-group friendly description is copied.

## WeChat Experience Version Checks

Do not use the WeChat DevTools preview QR code for multi-person family invitation testing. The preview/development QR code is temporary, tied to the current DevTools build, and can show "开发版小程序已过期，请在开发者工具重新扫码" after it expires or after the project is recompiled.

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
- Birthday/medicine/exercise reminders have a create/list/complete flow with member targeting, medicine/exercise frequency metadata, and birthday advance/day-of reminder rows. Real WeChat subscription-message delivery is implemented behind `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `WECHAT_REMINDER_TEMPLATE_ID`, and a scheduler that calls `/v1/reminders/dispatch-due`.
- Ledger has an MVP create/list flow with family-wide visibility; fine-grained finance visibility and export are not implemented yet.
- Digital space has an MVP create/list flow for document notes, account notes, and memory items. Real file upload, media upload, password storage, and fine-grained visibility are not implemented yet.
- Family activity day has an MVP create/list/copy-share-text flow. Complex RSVP, calendar sync, payments, and group automation are not implemented yet.
- Group embedded automation is not implemented yet.
- DevTools preview QR codes are temporary and unsuitable for multi-person invite testing. Use an experience version with added experience members for stable internal testing.
- Yellow DevTools warnings about base library or deprecated browser APIs can be ignored for this MVP acceptance.
- `webapi_getwxaasyncsecinfo:fail` is a WeChat DevTools/AppID SDK warning seen during local debugging. The project does not call this API. Treat it as non-blocking if the family, invitation, and reminder flows still work.
