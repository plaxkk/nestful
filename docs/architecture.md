# Architecture

## Overview

The MVP uses a WeChat Mini Program client, a Node.js API service, and shared TypeScript domain types.

```text
WeChat Mini Program
  -> API service
    -> relational database
    -> object storage
    -> reminder scheduler
    -> WeChat platform APIs
```

## Applications

### apps/miniprogram

Native WeChat Mini Program shell with TypeScript source files.

Initial pages:
- Home dashboard.
- Family space and members.
- Reminders.
- Activities.
- Memory wall.
- Health.
- Ledger.

### services/api

Fastify API service.

Initial responsibilities:
- Family and member APIs.
- Reminder APIs.
- Activity APIs.
- Memory metadata APIs.
- Health reminder APIs.
- Ledger APIs.
- WeChat login and subscription-message integration.

### packages/shared

Shared TypeScript models and enums.

## Data Domains

- User
- Family
- FamilyMember
- Reminder
- Activity
- MemoryItem
- HealthPlan
- LedgerEntry
- FamilyGoal

## Privacy Controls

- Family records are scoped by `familyId`.
- Sensitive domains include health, finance, documents, and account registry.
- Access checks must consider member role and explicit visibility settings.
- Sensitive writes should produce audit events.

## Phase 2 Integrations

- Tencent Cloud COS for file storage.
- Tencent Cloud TRTC / CallKit for mini-program audio and video calls.
- WeChat Pay for family membership and optional collection flows.

## WeChat Identity Direction

Phase 1 should use WeChat login as the source of identity:
- Mini-program calls `wx.login`.
- Backend exchanges code through WeChat `code2Session`.
- Backend stores `openid` against internal `User`.
- Client receives only an app session token, never `openid` or `session_key`.

See [WeChat Login and Invite Plan](wechat-login-invite-plan.md).
