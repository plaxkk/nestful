# Modern Humanist Interaction Direction

This document is the Figma-ready interaction direction for Nestful. It is written so the same decisions can be recreated in Figma and implemented in the mini program.

## Design Intent

Nestful should feel like a warm family notebook, not a financial or admin dashboard. The interaction should be calm, readable, and human, while still feeling modern and trustworthy.

The 2026-05-21 redesign references the local interaction package in `/design` without committing that directory. The extracted direction is "a family notebook on a sunlit table": high-contrast navy actions, warm paper background, generous spacing, rounded tactile cards, and one clear task per page.

## Visual Language

- Background: warm paper tone `#fff8f6`.
- Main text and buttons: deep navy `#041627`.
- Body text: warm ink `#2b1611`.
- Secondary text: soft stone `#44474c`.
- Human warmth accent: clay `#9a4b2f`, blush `#ffe9e4`, and soft border `#ffe2db`.
- Cards: white paper `#ffffff`, 12px visual radius, light warm borders.
- Typography: large WeChat-system type; titles 52-58rpx, body text 30-36rpx.

## Interaction Principles

1. One page answers one family job.
2. Copy uses everyday language: "记一笔", "最近记录", "家里的提醒".
3. Forms should feel conversational: type, category, title, amount, date.
4. Every record should immediately appear in a visible history list.
5. Status should be readable without training: "待提醒", "已完成", "+20.00 元", "-20.00 元".
6. Controls stay elder-friendly: large tap targets, high contrast, no hidden dense menus.

## Ledger Page Pattern

The ledger page is the first implementation of this direction:

- Top copy frames the page as a family notebook.
- Summary cards show balance, expense, income, and record count.
- The create form keeps only the minimum fields.
- Recent records use visual markers for income/expense and human-readable category/date text.

## 2026-05-21 Main-Path Redesign

Applied to the mini program:

- Home is now only two choices: create a family, or enter an invitation code.
- Create Family is a single-task page: family name plus one bottom action.
- Family overview prioritizes "next step: invite family" and "today's family tasks" before feature entry points.
- Invite Family uses a large digit invitation card plus two actions: WeChat share and copy code.
- Join Family lets a user enter/check the code, then enter their display name.
- Reminder, Activity, Digital Space, and Ledger pages use the same paper background, navy text/actions, rounded cards, and large inputs.

Implementation guardrails:

1. One page should have one primary action.
2. Primary buttons remain at least 100rpx tall.
3. Body copy stays at or above 30rpx.
4. Avoid words like "module", "config", "MVP", or "permission" in user-facing flow.
5. Keep the first path focused on creating a household before showing deeper family tasks.
