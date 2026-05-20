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

## Mini Program Manual Checks

Open WeChat DevTools with:

```text
/Users/kk/repos/family-housekeeper
```

Expected flow:

1. Home page renders "家庭管家".
2. Fill or keep default family name and display name.
3. Tap "创建家庭空间".
4. App navigates to "家庭空间".
5. Member list includes the current user.
6. Tap "生成成员邀请".
7. Invite code and join path are displayed.

## Known MVP Boundaries

- Data is in memory. Restarting the API clears families, members, and invitations.
- WeChat login is documented but not implemented.
- Database schema and privacy permissions are the next implementation task.
- Birthday, health, ledger, memory wall, and group embedded experience are not implemented yet.
- Yellow DevTools warnings about base library or deprecated browser APIs can be ignored for this MVP acceptance.
