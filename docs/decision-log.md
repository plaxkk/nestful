# Decision Log

## 2026-05-20: Create a Dedicated Repository

Decision: Create `~/repos/family-housekeeper` as the product repository.

Reasoning: The product needs independent code, docs, roadmap, and future open-source readiness.

## 2026-05-20: WeChat Mini Program First

Decision: MVP starts as a WeChat Mini Program.

Reasoning: The target usage and growth channels are WeChat groups, share cards, subscription messages, official account content, and video channel content.

## 2026-05-20: Keep Audio/Video as Phase 2

Decision: MVP validates family meeting workflows before full TRTC / CallKit integration.

Reasoning: Meeting scheduling, topics, notes, and follow-up tasks can validate demand with lower delivery risk. Real-time audio/video can be integrated once retention justifies the complexity.

## 2026-05-20: WeChat Login Owns Identity

Decision: Phase 1 identity will use `wx.login` plus backend `code2Session`, with backend-owned app session tokens.

Reasoning: The product is WeChat-first, but the client should not own `openid` or `session_key`. Keeping internal `User` and `FamilyMember` separate from WeChat identity preserves future portability and supports non-WeChat entry points later.

## 2026-05-20: Subscription Messages Are Scene-Based

Decision: Subscription-message authorization is requested only during concrete reminder/activity actions.

Reasoning: WeChat subscription messages depend on explicit user authorization. Asking for broad authorization during onboarding would reduce trust and is not a reliable push strategy.
