# Product Requirements

## Product Name

Working name: Nestful / 家庭管家.

## Users

- Remote family members who need lightweight daily connection.
- Parents managing children, learning materials, and household spending.
- Adult children caring for elders.
- Large families coordinating birthdays, gatherings, travel, health, and shared expenses.

## Core Jobs

- Remember important family days.
- Start and coordinate family activities.
- Keep family emotional communication recurring and visible.
- Store family documents, learning materials, photos, videos, and memory stories.
- Help family members follow medicine, exercise, and review schedules.
- Track household expenses, split costs, and plan common goals.

## Key User Stories

- As a daughter, I want to invite my parents and siblings into one family space so important reminders are visible to everyone.
- As a family admin, I want to add birthdays and anniversaries so WeChat can remind members before the day arrives.
- As a parent, I want to launch a family activity and collect attendance so everyone knows the plan.
- As a child caring for an elder, I want medicine reminders and missed-confirmation alerts.
- As a family member, I want to upload a photo and tag people, place, and story so memories do not disappear in chat history.
- As a sibling, I want to record elder medical expenses and split them transparently.

## Functional Modules

### Family Space

- Create family space.
- Invite via WeChat share card.
- Manage members and roles.
- Configure privacy and permission scopes.

### Reminders

- Birthday and anniversary reminder.
- Health reminder.
- Bill reminder.
- Activity reminder.

### Activities

- Create activity.
- RSVP.
- Assign tasks.
- Track budget.
- Link album and memory.

### Meetings

- Phase 1: meeting topic, reminder, notes, action items.
- Phase 2: TRTC / CallKit audio and video calls.

### Digital Space

- Memory wall.
- Learning material registry.
- Family document cabinet.
- Household account ledger with renewal reminders. This is for authorized household management, not for encouraging third-party account abuse.

### Health

- Medicine plan.
- Exercise plan.
- Health record.
- Caregiver escalation.

### Finance

- Household ledger.
- Expense split.
- Bill reminders.
- Family goal funds.

## Non-Functional Requirements

- Privacy by default.
- Family-level and member-level permission controls.
- Audit logs for sensitive changes.
- Clear delete and export path.
- No medical diagnosis.
- Explicit user consent before WeChat subscription-message reminders.
