import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const shortSha = git("rev-parse", "--short", "HEAD");
const status = git("status", "--short");
const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const versionLabel = optionValue("--version-label") ?? `${packageJson.version}-${today}-${shortSha}`;
const versionDescription =
  optionValue("--version-description") ?? `Nestful experience validation build ${versionLabel}`;
const recordPath =
  optionValue("--record-path") ?? `docs/experience-version-invite-validation-record-${versionLabel}.md`;
const infoOutput =
  optionValue("--info-output") ?? `docs/experience-version-upload-info-${versionLabel}.json`;
const healthOutput =
  optionValue("--health-output") ?? `docs/experience-version-api-health-${versionLabel}.json`;
const apiBaseUrl =
  optionValue("--api-base-url") ??
  miniProgramConfig.match(/trial:\s*"([^"]+)"/)?.[1] ??
  "https://nestful.kkplayit.online";
const snapshot = status ? `${shortSha} with local changes` : shortSha;
const statusLines = status ? status.split("\n").filter(Boolean) : [];
const statusPreviewLimit = 30;
const statusPreview = statusLines.slice(0, statusPreviewLimit).join("\n");
const omittedStatusCount = Math.max(0, statusLines.length - statusPreviewLimit);
const workingTreeStatus = statusLines.length ? "DIRTY - uncommitted changes are present" : "clean";
const traceabilitySection = statusLines.length
  ? `WARNING: the working tree has uncommitted changes. The version label contains HEAD ${shortSha}, but DevTools upload will include the files currently on disk. Commit or stash before upload if the build must map to an immutable git commit. If this WIP snapshot is intentional, keep the snapshot string, upload info output, and API health output in the validation record.

\`\`\`text
${statusPreview}${omittedStatusCount ? `\n... and ${omittedStatusCount} more entries` : ""}
\`\`\``
  : `Working tree is clean at HEAD ${shortSha}. The generated version label can be traced back to this commit.`;

const qualityGateCommand = ["npm", "run", "release:quality-gate"].map(shellQuote).join(" ");

const healthCommand = [
  "npm",
  "run",
  "experience:preflight",
  "--",
  "--check-api-health",
  "--api-base-url",
  apiBaseUrl,
  "--health-output",
  healthOutput,
]
  .map(shellQuote)
  .join(" ");

const draftCommand = [
  "npm",
  "run",
  "experience:record-draft",
  "--",
  "--output",
  recordPath,
  "--version-label",
  versionLabel,
  "--version-description",
  versionDescription,
  "--api-base-url",
  apiBaseUrl,
  "--upload-info-output",
  infoOutput,
  "--api-health-output",
  healthOutput,
]
  .map(shellQuote)
  .join(" ");

const uploadCommand = [
  "/Applications/wechatwebdevtools.app/Contents/MacOS/cli",
  "upload",
  "--project",
  root,
  "--port",
  "9420",
  "--disable-gpu",
  "--version",
  versionLabel,
  "--desc",
  versionDescription,
  "--info-output",
  infoOutput,
]
  .map(shellQuote)
  .join(" ");

const checkCommand = ["npm", "run", "experience:record-check", "--", recordPath].map(shellQuote).join(" ");

console.log(`# Experience-Version Upload Plan

This plan does not upload anything. Run the upload command only after explicit release approval.

| Field | Value |
| --- | --- |
| Git commit or working tree snapshot | ${snapshot} |
| WeChat AppID | ${projectConfig.appid} |
| Version label | ${versionLabel} |
| Version description | ${versionDescription} |
| Trial API base URL | ${apiBaseUrl} |
| Validation record path | ${recordPath} |
| Upload info output path | ${infoOutput} |
| API health output path | ${healthOutput} |
| Working tree status | ${workingTreeStatus} |

## Working Tree Traceability

${traceabilitySection}

1. Run the full local quality gate:

\`\`\`bash
${qualityGateCommand}
\`\`\`

2. Verify the trial API health endpoint and write evidence:

\`\`\`bash
${healthCommand}
\`\`\`

3. Generate the validation record draft:

\`\`\`bash
${draftCommand}
\`\`\`

4. After release approval, upload the experience build:

\`\`\`bash
${uploadCommand}
\`\`\`

5. Select the uploaded build as the experience version in the WeChat admin console and add two tester accounts as experience members.

6. After the two-tester invite run, fill every remaining placeholder in the validation record and verify it:

\`\`\`bash
${checkCommand}
\`\`\`
`);
