# Elder-Friendly UX

Family Housekeeper must be usable by elders and non-technical family members.

## Principles

- One page should have one primary action.
- Use everyday Chinese words; avoid product terms like MVP, module, dashboard, role, or workspace.
- Use step labels: 第 1 步, 第 2 步.
- Primary buttons should be at least 100rpx tall; secondary buttons should be at least 96rpx tall.
- Body text should be at least 30rpx; primary titles should be 52rpx or larger.
- Do not show unfinished modules as tappable cards on the first screen.
- If unfinished features are shown, label them as previews and say no action is needed now.
- Show family roles in Chinese, e.g. 管理员 / 家人.
- Error messages should say what to do next.
- Key setup paths should take no more than two main actions per page.

## Current MVP Flow

1. 首页：创建家庭空间；如果已经创建过，打开当前家庭.
2. 家庭页：邀请家人；邀请生成后发给家人.
3. 邀请页：确认邀请有效，填写称呼，加入家庭.

## Current Acceptance Focus

- 首页 should make the first action obvious: create a family first.
- 首页 future features should look like previews, not tappable work items.
- 家庭页 should make invite sharing the only primary next step.
- 加入页 should clearly say whether the invite is valid.
- Broken invite links should tell users to ask family to resend the invite.

## Later UX Direction

- Elder mode: only show 今日提醒, 一键确认, 联系家人.
- Caregiver mode: show family setup, reminders, health records, and invitations.
- Keep advanced settings outside the elder daily path.
