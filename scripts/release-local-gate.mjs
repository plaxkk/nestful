import { spawnSync } from "node:child_process";

const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;

const checks = [
  ["release local gate syntax", nodeBin, ["--check", "scripts/release-local-gate.mjs"]],
  ["release runtime smoke syntax", nodeBin, ["--check", "scripts/release-runtime-smoke.mjs"]],
  ["release quality gate syntax", nodeBin, ["--check", "scripts/release-quality-gate.mjs"]],
  ["typecheck", npmBin, ["run", "typecheck"]],
  ["test", npmBin, ["test"]],
  ["lint", npmBin, ["run", "lint"]],
  ["migration smoke", npmBin, ["run", "migration:smoke"]],
  ["mini-program static smoke", npmBin, ["run", "miniprogram:smoke"]],
  ["experience preflight", npmBin, ["run", "experience:preflight"]],
  ["experience record template check", npmBin, ["run", "experience:record-check"]],
  ["experience tooling smoke", npmBin, ["run", "experience:tooling-smoke"]],
];

const startedAt = Date.now();

for (const [name, command, args] of checks) {
  console.log(`\n# ${name}`);
  console.log(`$ ${[command, ...args].join(" ")}`);

  const result = spawnSync(command, args, {
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
console.log(`\nrelease local gate passed in ${elapsedSeconds}s`);
console.log(
  "Runtime checks still require npm run release:runtime-smoke, which starts the local API and DevTools automation but never previews or uploads.",
);
