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

## Mini Program Manual Checks

The current local API address for WeChat DevTools is:

```text
http://172.16.2.66:3100
```

If the Mac network address changes, update `apps/miniprogram/utils/api.js` and `apps/miniprogram/utils/api.ts`.

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

- Data persists to a local JSON file at `.data/family-housekeeper.json`; this is still an MVP stand-in for the target SQL database.
- WeChat login is documented but not implemented.
- Database schema and baseline privacy permissions are documented in `docs/database-schema.md`.
- Birthday, health, ledger, memory wall, and group embedded experience are not implemented yet.
- Yellow DevTools warnings about base library or deprecated browser APIs can be ignored for this MVP acceptance.
