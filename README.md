# Nestful

Nestful MVP，定位为专为家庭而生的微信生态家庭协作与情感连接工具。

## Product Positioning

Nestful helps a family manage reminders, activities, emotional communication, shared files, memories, health routines, and household finance in one private family space.

首发平台为微信小程序，围绕家庭成员邀请、家庭活动、生日提醒、健康提醒、记忆碎片墙和家庭账本完成 MVP 验证。

## Repository Layout

```text
apps/miniprogram/   WeChat Mini Program client
services/api/       Backend API service
packages/shared/    Shared TypeScript domain types
docs/               Product, architecture, roadmap, and decision docs
```

## MVP Scope

- Family space creation and member invitation.
- Member profiles, birthday and anniversary reminders.
- Family activity creation, RSVP, task assignment, and memory capture.
- Memory wall with photos, videos, notes, tags, and activity linkage.
- Health reminders for medicine, exercise, review visits, and care follow-up.
- Household ledger, expense sharing, bills, and family goals.
- WeChat sharing cards and subscription-message-based reminders.

### WeChat Reminder Notifications

Reminder notifications use WeChat Mini Program subscription messages. Configure these environment variables in production:

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_REMINDER_TEMPLATE_ID` or `WECHAT_MEDICINE_TEMPLATE_ID` for medicine reminders
- `WECHAT_BIRTHDAY_TEMPLATE_ID` and `WECHAT_EXERCISE_TEMPLATE_ID` when those reminder types should also request WeChat subscription-message authorization
- `WECHAT_MINIPROGRAM_STATE` (`trial` for experience version, `formal` after release)
- Medicine template keyword keys: `WECHAT_MEDICINE_TIME_KEY`, `WECHAT_MEDICINE_NAME_KEY`, `WECHAT_MEDICINE_USAGE_KEY`, `WECHAT_MEDICINE_DOSAGE_KEY`
- Birthday template keyword keys: `WECHAT_BIRTHDAY_NAME_KEY`, `WECHAT_BIRTHDAY_DATE_KEY`
- Exercise template keyword keys: `WECHAT_EXERCISE_PROJECT_KEY`, `WECHAT_EXERCISE_TIME_KEY`, `WECHAT_EXERCISE_PLAN_KEY`, `WECHAT_EXERCISE_FREQUENCY_KEY`, `WECHAT_EXERCISE_AMOUNT_KEY`
- `CRON_SECRET` or `NESTFUL_CRON_SECRET` for protecting the dispatch endpoint

After users authorize a reminder notification in the mini-program, `.github/workflows/reminder-dispatch.yml` calls `GET /v1/reminders/dispatch-due` every 5 minutes. Reminder plans create separate due occurrences; completing a recurring occurrence advances the next in-app occurrence, while WeChat subscription-message delivery remains bound to a one-time user authorization. Vercel Hobby only supports daily cron jobs, so near-real-time reminder dispatch uses GitHub Actions instead of Vercel Cron. If `CRON_SECRET` or `NESTFUL_CRON_SECRET` is enabled on the API, set the same value as the repository secret `NESTFUL_CRON_SECRET`.

## Initial Tech Direction

- WeChat Mini Program client with TypeScript.
- Node.js API service with Fastify.
- Shared TypeScript types for core family domain models.
- Object storage for family media and documents in later implementation.
- TRTC / CallKit integration is planned for phase 2 after meeting workflows are validated.

## Current Status

This repository is the initial MVP workspace. The first milestone is to produce clickable mini-program flows and API contracts for family space, reminders, activities, memory wall, health reminders, and ledger.

## Mini Program Preview

Open this repository root in WeChat DevTools:

```text
/Users/kk/repos/nestful
```

The root `project.config.json` points DevTools to `apps/miniprogram/`.

Run backend smoke acceptance:

```bash
npm run acceptance:smoke
```

The backend must be running first with `npm run dev:api`.

## Automated Quality Gate

Run these before handoff:

```bash
npm run release:quality-gate
```

`release:quality-gate` runs the full local handoff gate: `release:local-gate` followed by `release:runtime-smoke`.

`release:local-gate` runs the offline checks, including release script syntax checks, that do not need a local API server, WeChat DevTools automation, or external WeChat artifacts.

`release:runtime-smoke` starts the local API if needed, runs `acceptance:smoke`, starts WeChat DevTools automation on `ws://127.0.0.1:9421` if needed, runs `miniprogram:devtools-smoke`, and cleans up the local API/DevTools instances it started.

WeChat DevTools preview/upload creates external WeChat artifacts and should only be run after an explicit release approval.

Before an approved experience-version upload, generate the command plan and prefill the external validation record:

```bash
npm run experience:preflight
npm run experience:preflight -- --check-api-health --health-output docs/experience-version-api-health-<version>.json
npm run experience:upload-plan
npm run experience:record-draft -- --output docs/experience-version-invite-validation-record-<version>.md
```

After two real testers complete the invite flow, fill every remaining `TODO` in that record and validate it:

```bash
npm run experience:record-check -- docs/experience-version-invite-validation-record-<version>.md
```

The mini-program selects an API base URL from the WeChat runtime environment:

| WeChat envVersion | Default API |
| --- | --- |
| `develop` | `https://nestful.kkplayit.online` |
| `trial` | `https://nestful.kkplayit.online` |
| `release` | `https://nestful.kkplayit.online` |

For local API development, first start the API with `npm run dev:api`, then override the API URL in WeChat DevTools without editing source:

```js
wx.setStorageSync("nestful.apiBaseUrl", "http://127.0.0.1:3100")
```

Clear the override with:

```js
wx.removeStorageSync("nestful.apiBaseUrl")
```

## Docs

- [MVP Plan](docs/mvp-plan.md)
- [Product Requirements](docs/product-requirements.md)
- [Architecture](docs/architecture.md)
- [API Contract](docs/api-contract.md)
- [Database Schema and Privacy Permissions](docs/database-schema.md)
- [Vercel Postgres Persistence](docs/vercel-postgres-persistence.md)
- [WeChat Login and Invite Plan](docs/wechat-login-invite-plan.md)
- [WeChat Embedded Experience Plan](docs/wechat-embedded-experience-plan.md)
- [Acceptance Checklist](docs/acceptance-checklist.md)
- [Release Quality Gate](docs/release-quality-gate.md)
- [Experience-Version Invite Validation](docs/experience-version-invite-validation.md)
- [Elder-Friendly UX](docs/elder-friendly-ux.md)
- [Modern Humanist Interaction Direction](docs/humanist-interaction-design.md)
- [Roadmap](docs/roadmap.md)
- [Decision Log](docs/decision-log.md)
