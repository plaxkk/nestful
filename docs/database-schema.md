# Nestful database schema

The current redesign is documented in [Data model v2](data-model-v2.md).
Its executable schema is `services/api/migrations/003_relational_v2_up.sql`, followed by `004_cursor_timestamp_precision_up.sql` and `005_runtime_role_membership_up.sql`.

The API now uses independently stored records in the private `nestful` schema:
identity, family membership, reminders and delivery tasks, ledger, activities,
digital space, and append-only audit. Activities and digital space are independent
modules with an optional explicit save-to-memory operation.

`001_normalized_postgres_*` and `002_private_app_state_up.sql` are historical
migrations for the JSONB bridge. Do not run the old projection as the v2 cutover:
it neither matches the new model nor switches the API storage implementation.
`public.nestful_app_state` is legacy recovery data, not the new runtime store.

Apply migrations using owner credentials. The API enters `nestful_runtime` in
every transaction. A dedicated login granted that role is preferred; the initial
deployment uses the existing `postgres` pooler login at the user's request, with
explicit `SET TRUE` membership authorized separately. Client roles have no direct schema access. Family
and action authorization is enforced by API repositories, not by assuming an
application user ID is a Supabase Auth UID.

Run `npm run test:postgres` to validate actual constraints, permissions, concurrent
writes, calendar scheduling, and Fastify authorization against disposable Postgres.
