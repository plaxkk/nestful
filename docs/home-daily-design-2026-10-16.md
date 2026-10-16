# Home: 家的日常

The user selected the first of three homepage concepts, “家的日常”.

## Product behavior

- Returning users see the selected family's daily arrangements directly on Home;
  only users without a family see creation/join onboarding.
- A fresh ordinary Home entry prefers the primary family. In-app navigation,
  creation/join completion and exact shared activities preserve their context.
- The family name opens a bottom sheet. Other families, create/join and explicit
  “设为主家庭” live here. Switching temporarily does not change the primary family.
- The primary preference is device-local, scoped to the signed-in user and
  cleared at explicit logout. It is not a server-synchronized profile field.
- Home shows one upcoming gathering, outstanding responses/preparation tasks,
  and reminders relevant to the current member. Counts are from the existing
  authenticated dashboard, with its existing result limits; no example data is
  shipped. Activity details load independently after the dashboard.
- RSVP offers all three existing responses. Task completion reads the latest
  task version and prevents duplicate in-flight writes. Failed writes are not
  presented as success.
- Home / Activities / Records / Family navigation keeps ordinary page routes,
  preserving query-bearing activity cards. It reuses existing list pages and
  avoids exceeding WeChat's navigation stack limit.
- Invitations, joining approvals, member profiles and settings live in Family.
  Administrators get a pending-application badge on Home's Family destination.
  Ledger and reminder shortcuts remain available on Home.
- Reused record/management pages clear the previous family's records, invitation
  tokens and applications before rendering a different family. Obsolete Home
  requests cannot overwrite the current family or a more recent refresh.

## Visual direction

Warm paper `#faf7f1`, forest green `#365b44`, sand gathering surface `#f1e6d3`,
quiet secondary text, generous space, and large accessible action targets.
Empty, loading, failure and first-family states follow the same direction.
The approved concept's sample dinner/birthday data is not part of the app.

## Verification

- `npm run release:local-gate` passed, including typecheck/lint, generated JS,
  template/component handlers, ten existing MVP flows and fourteen Home flows.
  After final UI/badge changes, the mini-program build and all client flows passed
  again. No API or database change is required by this redesign.
- Chrome layout checks used the actual WXML/WXSS with sample data at 320px and
  390px, including daily, empty, failure, onboarding and family-switch states;
  no horizontal overflow or renderer errors. This is a browser rendering aid,
  not a claim of native simulator or phone acceptance.
- Official WeChat DevTools preview compilation passed. Final preview artifacts
  live outside Git in the conversation's visualization directory, named
  `nestful-home-daily-preview-2026-10-16`.
- No formal submission or public mini-program release was performed. Phone
  acceptance should cover Home appearance, primary/temporary switching,
  response/completion refresh, invitation approvals and exact group-card entry.
