# WeChat Embedded Experience Plan

## Goal

Reduce the number of steps needed to use Nestful in WeChat. The target user experience is: a family member can see and act on family reminders, activities, and care tasks directly from the family WeChat group or a persistent WeChat entry, without searching for and reopening the mini-program manually.

## Product Constraint

A normal WeChat group is not an open bot container. A mini-program cannot permanently live inside a normal group chat, freely read all group messages, or automatically send group messages without user action and platform-approved capabilities.

The product should therefore use WeChat-native entry points:
- Mini-program share cards in the family group.
- Group to-do / dynamic messages for tasks that need member confirmation.
- Mini-program share ticket / openGId to bind a WeChat group to a family space.
- Subscription messages for explicit reminder scenes after user authorization.
- Official account / service account menu for persistent individual entry.
- "My Mini Programs" / floating window as user-side quick access.
- Chat Tool mode if available to this mini-program category and approved by WeChat.

## Recommended UX Architecture

### 1. Family Group Binding

Flow:
1. User creates a family space.
2. User shares a "绑定家庭群" mini-program card to the family WeChat group.
3. Group members open the card.
4. Mini-program obtains group context through share-ticket based flow where permitted.
5. Backend maps `familyId` to `openGId`.

Value:
- The family group becomes the social container.
- The mini-program remains the structured task/data layer.
- Family members enter from the group card instead of searching manually.

### 2. Group Dashboard Card

Send a recurring group card manually or from user-triggered actions:
- "今日家庭看板"
- "本周家庭活动"
- "待确认健康提醒"
- "生日祝福接龙"

Card content should be action-oriented:
- 2 pending reminders.
- 1 activity awaiting RSVP.
- 1 member has not confirmed medicine.
- Tap to complete.

This gives the group a visible anchor message.

### 3. Group To-Do and Dynamic Message

Use for scenarios that require family members to confirm:
- Activity RSVP.
- Medicine confirmation.
- Birthday blessing collection.
- Family meeting attendance.
- Household expense confirmation.

Desired behavior:
- A member launches a family task.
- The mini-program shares it into the group as a group to-do or dynamic message when platform support is available.
- Members tap the message to complete.
- Shared card state updates, e.g. "3/5 members confirmed".

This is the closest product shape to "常驻在群里".

### 4. Official Account / Service Account Persistent Entry

Use an official account as an individual persistent entry:
- Menu item: "打开家庭空间".
- Menu item: "今日提醒".
- Menu item: "新增提醒".
- Service notifications or template-like reminders where compliant.

This does not live inside a group, but it can stay in the user's WeChat conversation list after follow and gives a stable entry independent of mini-program search.

### 5. User-Side Quick Access

Guide users to:
- Add the mini-program to "我的小程序".
- Add to floating window if available.
- Pin the family WeChat group.

These are not fully product-controlled, but they reduce friction for early users.

### 6. Chat Tool Mode Evaluation

WeChat's chat tool capabilities are the direction most aligned with "use inside chat". If our category and account can access it, evaluate it for:
- Opening a family task panel from a chat.
- Sending task/reminder content into the current group.
- Notifying group members for concrete tasks.

Risk:
- Availability and approval may be limited by WeChat capability access, category, and platform review.
- Do not make MVP success depend on this until confirmed in developer tools and account permissions.

## MVP Recommendation

Implement in this order:

1. Group binding card
   - Bind family space to group context.
   - Store `openGId` if available.

2. Today dashboard share card
   - One-tap card shared into the family group.
   - Shows pending reminders, activities, and confirmations.

3. Group confirmation tasks
   - Activity RSVP.
   - Medicine confirmation.
   - Birthday blessing.

4. Subscription-message reminders
   - Per-scene authorization.
   - Remind individual members, not broadcast spam.

5. Official account entry
   - Menu opens family dashboard.
   - Later support customer service and care assistant.

6. Chat Tool proof of concept
   - Verify whether the mini-program account can access it.
   - Build only after platform availability is clear.

## What Not To Do

- Do not depend on scraping or reading WeChat group chat history.
- Do not promise a normal WeChat group bot for personal WeChat.
- Do not rely on unlimited push notifications.
- Do not make users search for the mini-program each time.

## External References

- Mini-program share forwarding: <https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html>
- Mini-program subscription messages: <https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html>
- `wx.updateShareMenu` capability reference: <https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.updateShareMenu.html>
- Chat Tool documentation entry: <https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/chatTool.html>
