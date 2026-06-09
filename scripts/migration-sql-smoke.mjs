import { readFileSync } from "node:fs";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const read = (path) => readFileSync(path, "utf8");

const up = read("services/api/migrations/001_normalized_postgres_up.sql");
const verify = read("services/api/migrations/001_normalized_postgres_verify.sql");
const down = read("services/api/migrations/001_normalized_postgres_down.sql");

const expectedCreatedTables = [
  "users",
  "wechat_identities",
  "user_sessions",
  "families",
  "family_members",
  "family_invitations",
  "reminder_plans",
  "reminders",
  "activities",
  "activity_participants",
  "activity_tasks",
  "audit_events",
  "ledger_entries",
  "ledger_goal_funds",
  "digital_space_items",
];

const expectedVerifiedTables = expectedCreatedTables.filter((table) => table !== "wechat_identities");

for (const table of expectedCreatedTables) {
  assert(up.includes(`create table if not exists ${table}`), `up migration missing ${table}`);
}

for (const table of expectedVerifiedTables) {
  assert(verify.includes(table), `verify migration missing ${table}`);
}

const expectedIndexFragments = [
  "family_id",
  "member_id",
  "assignee_member_id",
  "created_by_member_id",
  "due_at",
  "next_due_at",
  "created_at",
  "occurred_at",
];

for (const fragment of expectedIndexFragments) {
  assert(up.includes(fragment), `up migration missing index coverage for ${fragment}`);
}

assert(up.includes("nestful_app_state"), "up migration should backfill from JSONB app state");
assert(verify.includes("count_delta"), "verify migration should expose count deltas");
assert(!/drop table if exists nestful_app_state/i.test(down), "rollback must not drop JSONB app state");
assert(down.includes("delete from nestful_schema_migrations"), "rollback should clear migration marker");

console.log("migration sql smoke passed");
