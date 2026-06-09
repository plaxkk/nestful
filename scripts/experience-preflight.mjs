import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(".");
const devtoolsCliPath = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
const args = process.argv.slice(2);

const checks = [];
const warnings = [];
const failures = [];
let apiHealthEvidence;

const hasFlag = (name) => args.includes(name);
const optionValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const ok = (message) => {
  checks.push(message);
};

const warn = (message) => {
  warnings.push(message);
};

const fail = (message) => {
  failures.push(message);
};

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

const runNode = (args) =>
  execFileSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const parseApiBaseUrl = (configSource, envName) => configSource.match(new RegExp(`${envName}:\\s*"([^"]+)"`))?.[1];
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const assertPublicHttpsApi = (envName, value) => {
  if (!value) {
    fail(`Mini Program config is missing a default ${envName} API base URL.`);
    return;
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    fail(`${envName} API base URL is not a valid URL: ${value}`);
    return;
  }

  if (url.protocol !== "https:") {
    fail(`${envName} API base URL must use https for real WeChat experience-version devices: ${value}`);
  } else if (localHosts.has(url.hostname)) {
    fail(`${envName} API base URL must not point at a local host for experience-version devices: ${value}`);
  } else {
    ok(`${envName} API base URL is public HTTPS: ${value}`);
  }
};

const assertHealthCheckTarget = (value, allowLocalApi) => {
  let url;

  try {
    url = new URL(value);
  } catch {
    fail(`API health check target is not a valid URL: ${value}`);
    return undefined;
  }

  if (!allowLocalApi && url.protocol !== "https:") {
    fail(`API health check target must use https unless --allow-local-api is set: ${value}`);
    return undefined;
  }

  if (!allowLocalApi && localHosts.has(url.hostname)) {
    fail(`API health check target must not point at a local host unless --allow-local-api is set: ${value}`);
    return undefined;
  }

  return url;
};

const checkApiHealth = async (baseUrl, healthPath, allowLocalApi) => {
  const targetUrl = assertHealthCheckTarget(baseUrl, allowLocalApi);

  if (!targetUrl) {
    return undefined;
  }

  const normalizedHealthPath = healthPath.startsWith("/") ? healthPath : `/${healthPath}`;
  const healthUrl = new URL(normalizedHealthPath, targetUrl);
  const maxAttempts = 3;

  let output;
  let lastFailure;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      output = execFileSync(
        "curl",
        ["-L", "-sS", "--max-time", "15", "-H", "Accept: application/json", "-w", "\nHTTP_STATUS:%{http_code}", healthUrl.href],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      break;
    } catch (error) {
      lastFailure = String(error.stderr || error.message).trim();

      if (attempt < maxAttempts) {
        warn(`API health check attempt ${attempt}/${maxAttempts} failed for ${healthUrl.href}; retrying.`);
        await sleep(1000 * attempt);
      }
    }
  }

  if (!output) {
    fail(`API health check could not reach ${healthUrl.href} after ${maxAttempts} attempts: ${lastFailure}`);
    return undefined;
  }

  const statusMatch = output.match(/\nHTTP_STATUS:(\d{3})\s*$/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  const body = statusMatch ? output.slice(0, statusMatch.index).trim() : output.trim();

  if (!status || status < 200 || status >= 300) {
    fail(`API health check failed for ${healthUrl.href}: HTTP ${status ?? "unknown"} ${body.slice(0, 200)}`);
    return undefined;
  }

  if (body.trim()) {
    try {
      const json = JSON.parse(body);

      if (json.ok === false) {
        fail(`API health check returned ok=false for ${healthUrl.href}`);
        return undefined;
      }
    } catch {
      warn(`API health check at ${healthUrl.href} returned non-JSON body; HTTP status was ${status}`);
    }
  }

  ok(`API health check passed: ${healthUrl.href}`);
  return {
    checkedAt: new Date().toISOString(),
    apiBaseUrl: targetUrl.origin,
    healthUrl: healthUrl.href,
    status,
    body,
  };
};

const packageJson = readJson("package.json");
const projectConfig = readJson("project.config.json");
const miniProgramConfig = readFileSync(resolve(root, "apps/miniprogram/utils/config.ts"), "utf8");
const shouldCheckApiHealth = hasFlag("--check-api-health");
const allowLocalApi = hasFlag("--allow-local-api");
const healthPath = optionValue("--health-path") ?? "/health";
const healthOutput = optionValue("--health-output");

const requiredScripts = [
  "typecheck",
  "test",
  "lint",
  "migration:smoke",
  "miniprogram:smoke",
  "miniprogram:devtools-smoke",
  "acceptance:smoke",
  "experience:upload-plan",
  "experience:record-draft",
  "experience:record-check",
  "experience:tooling-smoke",
  "experience:preflight",
  "release:local-gate",
  "release:runtime-smoke",
  "release:quality-gate",
];

for (const script of requiredScripts) {
  if (packageJson.scripts?.[script]) {
    ok(`package script exists: ${script}`);
  } else {
    fail(`package script is missing: ${script}`);
  }
}

if (/^wx[a-z0-9]{16,}$/i.test(projectConfig.appid ?? "")) {
  ok(`project AppID is configured: ${projectConfig.appid}`);
} else {
  fail(`project.config.json has an invalid or missing AppID: ${projectConfig.appid ?? "<missing>"}`);
}

const miniprogramRoot = projectConfig.miniprogramRoot ?? "";

if (miniprogramRoot && existsSync(resolve(root, miniprogramRoot, "app.json"))) {
  ok(`miniprogramRoot points at an app.json: ${miniprogramRoot}`);
} else {
  fail(`miniprogramRoot is missing or does not contain app.json: ${miniprogramRoot || "<missing>"}`);
}

if (existsSync(devtoolsCliPath)) {
  ok(`WeChat DevTools CLI exists: ${devtoolsCliPath}`);
} else {
  fail(`WeChat DevTools CLI is missing at ${devtoolsCliPath}`);
}

const trialApiBaseUrl = parseApiBaseUrl(miniProgramConfig, "trial");
const releaseApiBaseUrl = parseApiBaseUrl(miniProgramConfig, "release");
const healthCheckApiBaseUrl = optionValue("--api-base-url") ?? trialApiBaseUrl;

assertPublicHttpsApi("trial", trialApiBaseUrl);
assertPublicHttpsApi("release", releaseApiBaseUrl);

if (shouldCheckApiHealth) {
  apiHealthEvidence = await checkApiHealth(healthCheckApiBaseUrl, healthPath, allowLocalApi);
} else {
  warn("API health was not checked; run with --check-api-health before an approved experience-version upload");
}

if (healthOutput && !shouldCheckApiHealth) {
  fail("--health-output requires --check-api-health.");
}

try {
  runNode(["scripts/experience-validation-record-check.mjs"]);
  ok("experience validation record template passes checker");
} catch (error) {
  fail(`experience validation record template check failed: ${error.stderr || error.message}`);
}

let uploadPlan = "";

try {
  uploadPlan = runNode(["scripts/experience-upload-plan.mjs", "--version-label", "preflight-check"]);
  ok("experience upload plan generates without side effects");
} catch (error) {
  fail(`experience upload plan failed: ${error.stderr || error.message}`);
}

if (uploadPlan) {
  const requiredPlanSnippets = [
    "This plan does not upload anything",
    "Working Tree Traceability",
    "--info-output",
    projectConfig.appid,
    trialApiBaseUrl,
  ].filter(Boolean);

  for (const snippet of requiredPlanSnippets) {
    if (uploadPlan.includes(snippet)) {
      ok(`upload plan includes: ${snippet}`);
    } else {
      fail(`upload plan is missing expected text: ${snippet}`);
    }
  }
}

const status = git("status", "--short");

if (status) {
  const changedCount = status.split("\n").filter(Boolean).length;
  warn(`working tree has ${changedCount} changed entries; upload-plan will mark the build as a WIP snapshot`);
} else {
  ok("working tree is clean");
}

if (healthOutput && apiHealthEvidence && failures.length === 0) {
  const healthOutputPath = resolve(root, healthOutput);
  mkdirSync(dirname(healthOutputPath), { recursive: true });
  writeFileSync(healthOutputPath, `${JSON.stringify(apiHealthEvidence, null, 2)}\n`);
  ok(`API health evidence written: ${healthOutput}`);
}

console.log("# Experience-Version Preflight");
console.log("");
console.log("Checks:");

for (const check of checks) {
  console.log(`- OK ${check}`);
}

if (warnings.length > 0) {
  console.log("");
  console.log("Warnings:");

  for (const warning of warnings) {
    console.log(`- WARN ${warning}`);
  }
}

if (failures.length > 0) {
  console.log("");
  console.log("Failures:");

  for (const failure of failures) {
    console.log(`- FAIL ${failure}`);
  }

  throw new Error("experience-version preflight failed");
}

console.log("");
console.log("experience-version preflight passed");
