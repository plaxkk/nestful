import { spawnSync } from "node:child_process";

const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";

const checks = [
  ["release local gate", ["run", "release:local-gate"]],
  ["release runtime smoke", ["run", "release:runtime-smoke"]],
];

const startedAt = Date.now();

for (const [name, args] of checks) {
  console.log(`\n# ${name}`);
  console.log(`$ npm ${args.join(" ")}`);

  const result = spawnSync(npmBin, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\nrelease quality gate passed in ${elapsedSeconds}s`);
console.log("External experience-version upload and two-tester validation still require explicit release approval.");
