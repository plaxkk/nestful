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
/Users/kk/repos/family-housekeeper
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
2. Tap "生日和健康"; create a reminder with type "吃药", then confirm it appears as "待提醒".
3. Tap "完成" and confirm the reminder status changes to "已完成".
4. Return to the family page and tap "家庭账本".
5. Create one ledger entry, then confirm it appears in "最近记录".
6. Return to the family page and tap "记忆墙".
7. Create one document/account/memory item, then confirm it appears in "已经放好的东西".
8. Return to the family page and tap "家庭活动".
9. Create one activity, then confirm it appears in "已经发起的活动".
10. Tap "复制群里说明" and confirm a family-group friendly description is copied.

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

- Data persists to a local JSON file at `.data/family-housekeeper.json`; this is still an MVP stand-in for the target SQL database.
- WeChat login is documented but not implemented.
- Database schema and baseline privacy permissions are documented in `docs/database-schema.md`.
- Birthday/medicine/exercise reminders have an MVP create/list/complete flow; real WeChat subscription-message delivery is not implemented yet.
- Ledger has an MVP create/list flow with family-wide visibility; fine-grained finance visibility and export are not implemented yet.
- Digital space has an MVP create/list flow for document notes, account notes, and memory items. Real file upload, media upload, password storage, and fine-grained visibility are not implemented yet.
- Family activity day has an MVP create/list/copy-share-text flow. Complex RSVP, calendar sync, payments, and group automation are not implemented yet.
- Group embedded automation is not implemented yet.
- Yellow DevTools warnings about base library or deprecated browser APIs can be ignored for this MVP acceptance.
- `webapi_getwxaasyncsecinfo:fail` is a WeChat DevTools/AppID SDK warning seen during local debugging. The project does not call this API. Treat it as non-blocking if the family, invitation, and reminder flows still work.
