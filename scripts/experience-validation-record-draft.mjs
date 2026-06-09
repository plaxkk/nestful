import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const optionValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const root = resolve(".");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const projectConfig = JSON.parse(readFileSync(resolve(root, "project.config.json"), "utf8"));
const miniProgramConfig = readFileSync(resolve(root, "apps/miniprogram/utils/config.ts"), "utf8");

const git = (...gitArgs) =>
  execFileSync("git", gitArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

const shortSha = git("rev-parse", "--short", "HEAD");
const status = git("status", "--short");
const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const uploadedVersionLabel = optionValue("--version-label") ?? `${packageJson.version}-${today}-${shortSha}`;
const uploadedVersionDescription =
  optionValue("--version-description") ?? `Nestful experience validation build ${uploadedVersionLabel}`;
const apiBaseUrl =
  optionValue("--api-base-url") ??
  miniProgramConfig.match(/trial:\s*"([^"]+)"/)?.[1] ??
  "https://nestful.kkplayit.online";
const uploadInfoOutput =
  optionValue("--upload-info-output") ?? `docs/experience-version-upload-info-${uploadedVersionLabel}.json`;
const apiHealthOutput =
  optionValue("--api-health-output") ?? `docs/experience-version-api-health-${uploadedVersionLabel}.json`;
const output = optionValue("--output");

const snapshot = status ? `${shortSha} with local changes` : shortSha;
const generatedAt = new Date().toISOString();

const record = `# Experience-Version Invite Validation Record

Use this record with \`docs/experience-version-invite-validation.md\`. Complete every placeholder value after the real two-tester experience-version run.

Draft generated at: ${generatedAt}

## Build

| Field | Value |
| --- | --- |
| Git commit or working tree snapshot | ${snapshot} |
| WeChat AppID | ${projectConfig.appid} |
| Uploaded version label | ${uploadedVersionLabel} |
| Uploaded version description | ${uploadedVersionDescription} |
| Upload time | TODO |
| Upload info output | ${uploadInfoOutput} |
| API health output | ${apiHealthOutput} |
| Experience version selected in admin console | TODO |
| Production/trial API base URL | ${apiBaseUrl} |

## Testers

Tester aliases must identify two distinct WeChat experience-member accounts.

| Field | Value |
| --- | --- |
| Tester A alias | TODO |
| Tester B alias | TODO |
| Tester A added as experience member | TODO |
| Tester B added as experience member | TODO |

## Evidence

Each evidence value must be an \`http(s)\` URL, an existing local file path, or a Markdown link to one of those targets. Multiple references can be separated with commas.

| Moment | Evidence |
| --- | --- |
| Tester A opens the experience version home page | TODO |
| Tester A creates a family and lands on the family overview | TODO |
| Tester A generates an invitation code or share card | TODO |
| Tester B opens the same experience version | TODO |
| Tester B enters the invitation code and sees "邀请有效" | TODO |
| Tester B joins with a display name | TODO |
| Tester A sees Tester B in "家里人" | TODO |

## Result

| Field | Value |
| --- | --- |
| Final result | TODO |
| Family name | TODO |
| Invitation code or share-card path | TODO |
| Tester B display name | TODO |
| Failure notes | TODO |

## Completion Note

\`\`\`text
Experience-version invite validation passed on TODO.
Build: ${uploadedVersionLabel}, commit/snapshot: ${snapshot}.
Tester A: TODO, Tester B: TODO.
Result: Tester A created family TODO, generated invite, Tester B joined, Tester A confirmed Tester B in member list.
Evidence: TODO.
\`\`\`
`;

if (output) {
  const outputPath = resolve(root, output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, record);
  console.log(`experience validation record draft written to ${output}`);
} else {
  process.stdout.write(record);
}
