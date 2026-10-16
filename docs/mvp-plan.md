# MVP Plan

Updated 2026-10-16. Earlier six-module launch plans are superseded by this scope.

## Product hypothesis

Families need a way to turn arrangements buried in WeChat group chat into clear
plans: who is coming, who has not responded, who is doing each preparation task,
and whether the time or place changed. Validate that job before expanding the
product into a general household management suite.

## First trial scope

- Real WeChat login, separate families, admin/member permissions and profiles.
- Individual invites and bounded, expiring, revocable group invites. Group invites
  default to administrator approval; joining is not inferred from group membership.
- Exact activity cards, destination preservation through joining, RSVP and tasks.
- Activity edit/cancel; material changes require other participants to reconfirm.
- Family homepage with real pending responses, assigned tasks and near-term reminders.
- Birthday/basic reminder plans, explicit per-recipient one-time subscription state,
  edit/pause, and preserved completion history.
- Existing ledger with correction and voiding; text/link records with copyable links.
- Explicit activity-to-memory saving, independent from the digital space module.
- Family exit, last-admin protection, management handoff guidance, archive, privacy
  information, logout and a WeChat feedback/data-request entry.

## Not current promises

- Reliable medicine alarms, emergency escalation or confirmation that a user read
  a notification. One-time subscription is not permanent delivery permission.
- Real photo/file storage, a password vault, automatic extraction of chat history,
  automatic group-member import or automatic messages into ordinary WeChat groups.
- Expense settlement/payments, full meeting/call tooling or a public community.
- Group tools, group to-dos and dynamic cards before account eligibility and
  client behavior have been verified. Ordinary shared cards must work first.

Keep finance and digital records available without treating each as a separate
launch acquisition promise. Their next investment depends on observed use.

## Release gates

1. Complete local quality gate, isolated multi-user Postgres/Fastify tests and
   emitted mini-program flow regressions.
2. Build and deploy API; check additive schema migration, runtime privileges and
   production health/auth isolation. Back up business data before migration.
3. Compile a mini-program preview. This is not formal publication.
4. Two real WeChat accounts verify group join/approval, object-specific entry,
   switching families, RSVP, edit/reconfirm, task completion, exit/revocation,
   reminder authorization/receipt and privacy. Record failures, not just screenshots.
5. Verify account-console filing, category, privacy declarations and template
   eligibility. Submit/publish only after the user's explicit acceptance.

## Trial and measurement

Recruit 5–10 real families for two weeks. A useful initial activation definition
is at least two members completing a shared arrangement/response, rather than
merely creating a family. Check invite-to-join, first-response completion, return
for the next arrangement, and active-family retention appropriate to event frequency.

These are proposed evaluation criteria, not measured success claims. WeChat card
preparation does not prove a card was sent; provider acceptance does not prove
notification delivery or reading. Avoid raw tokens and health content in metrics.

See [execution and release evidence](mvp-optimization-2026-10-16.md).
