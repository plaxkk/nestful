import { spawnSync } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// Integration tests boot disposable Postgres and use the actual Fastify routes.
// Phone/DevTools acceptance is a separate external gate requiring WeChat login.
const result = spawnSync(npm, ["run", "test:postgres"], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (!process.exitCode) console.log("release runtime smoke passed against isolated Postgres and Fastify");
