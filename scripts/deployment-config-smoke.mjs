import { readFileSync } from "node:fs";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const reminderDispatchWorkflow = readFileSync(".github/workflows/reminder-dispatch.yml", "utf8");
const wechatSource = readFileSync("services/api/src/wechat.ts", "utf8");

const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
assert(
  rewrites.some(
    (rewrite) =>
      rewrite?.source === "/v1/:path*" && rewrite?.destination === "/api?path=/v1/:path*",
  ),
  "vercel.json must route /v1/* requests to the API function",
);

assert(
  reminderDispatchWorkflow.includes('cron: "*/5 * * * *"'),
  "reminder dispatch workflow must run every 5 minutes",
);
assert(
  reminderDispatchWorkflow.includes("workflow_dispatch:"),
  "reminder dispatch workflow must support manual runs",
);
assert(
  reminderDispatchWorkflow.includes("https://nestful.kkplayit.online/v1/reminders/dispatch-due"),
  "reminder dispatch workflow must call the production dispatch endpoint",
);
assert(
  reminderDispatchWorkflow.includes("Authorization: Bearer $CRON_SECRET"),
  "reminder dispatch workflow must support authenticated dispatch",
);

const crons = Array.isArray(config.crons) ? config.crons : [];
assert(
  !crons.some((cron) => cron?.path === "/v1/reminders/dispatch-due" && cron?.schedule !== "0 0 * * *"),
  "Vercel Hobby cannot run sub-daily reminder dispatch cron jobs",
);

assert(
  wechatSource.includes('REMINDER_TIME_ZONE') && wechatSource.includes('Asia/Shanghai'),
  "subscription reminder template times must be formatted in the configured local reminder time zone",
);

console.log("deployment config smoke passed");
