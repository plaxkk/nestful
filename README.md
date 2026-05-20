# Family Housekeeper

家庭管家 MVP，定位为专为家庭而生的微信生态家庭协作与情感连接工具。

## Product Positioning

Family Housekeeper helps a family manage reminders, activities, emotional communication, shared files, memories, health routines, and household finance in one private family space.

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

## Initial Tech Direction

- WeChat Mini Program client with TypeScript.
- Node.js API service with Fastify.
- Shared TypeScript types for core family domain models.
- Object storage for family media and documents in later implementation.
- TRTC / CallKit integration is planned for phase 2 after meeting workflows are validated.

## Current Status

This repository is the initial MVP workspace. The first milestone is to produce clickable mini-program flows and API contracts for family space, reminders, activities, memory wall, health reminders, and ledger.

## Docs

- [MVP Plan](docs/mvp-plan.md)
- [Product Requirements](docs/product-requirements.md)
- [Architecture](docs/architecture.md)
- [API Contract](docs/api-contract.md)
- [WeChat Login and Invite Plan](docs/wechat-login-invite-plan.md)
- [WeChat Embedded Experience Plan](docs/wechat-embedded-experience-plan.md)
- [Roadmap](docs/roadmap.md)
- [Decision Log](docs/decision-log.md)
