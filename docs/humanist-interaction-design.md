# Modern Humanist Interaction Direction

This document is the Figma-ready interaction direction for Family Housekeeper. It is written so the same decisions can be recreated in Figma and implemented in the mini program.

## Design Intent

Family Housekeeper should feel like a warm family notebook, not a financial or admin dashboard. The interaction should be calm, readable, and human, while still feeling modern and trustworthy.

## Visual Language

- Background: warm paper tone `#f6f1ea`.
- Main text: near-ink brown `#251f1a`.
- Secondary text: soft stone `#6d6258`.
- Positive/action accent: calm green `#22745f`.
- Human warmth accent: clay `#9a4b2f` and muted brown `#8d5b3e`.
- Cards: white paper `#fffdfa`, 8px visual radius, light warm borders.
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

Future Phase 2 pages should reuse this pattern before introducing new visual language.
