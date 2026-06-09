import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const node = process.execPath;

const run = (args) =>
  execFileSync(node, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const expectFailure = (args, description) => {
  try {
    run(args);
  } catch {
    return;
  }

  throw new Error(`${description} unexpectedly passed`);
};

const replaceAll = (value, replacements) => {
  let result = value;

  for (const [from, to] of replacements) {
    result = result.replaceAll(from, to);
  }

  return result;
};

const tmp = mkdtempSync(join(tmpdir(), "nestful-experience-tooling-"));

try {
  const uploadPlan = run(["scripts/experience-upload-plan.mjs", "--version-label", "tooling-smoke"]);

  if (
    !uploadPlan.includes("Experience-Version Upload Plan") ||
    !uploadPlan.includes("Working Tree Traceability") ||
    !uploadPlan.includes("Working tree status") ||
    !uploadPlan.includes("API health output path") ||
    !uploadPlan.includes("release:quality-gate") ||
    !uploadPlan.includes("'upload'")
  ) {
    throw new Error("upload plan did not include the expected traceability metadata and upload command");
  }

  const preflight = run(["scripts/experience-preflight.mjs"]);

  if (
    !preflight.includes("Experience-Version Preflight") ||
    !preflight.includes("API health was not checked") ||
    !preflight.includes("experience-version preflight passed")
  ) {
    throw new Error("preflight did not report the expected pass state");
  }

  run(["scripts/experience-validation-record-check.mjs"]);

  const draftPath = join(tmp, "record-draft.md");
  run([
    "scripts/experience-validation-record-draft.mjs",
    "--output",
    draftPath,
    "--version-label",
    "tooling-smoke",
    "--version-description",
    "Experience tooling smoke",
    "--api-base-url",
    "https://example.invalid/api",
  ]);
  expectFailure(["scripts/experience-validation-record-check.mjs", draftPath], "draft record check");

  const evidenceFiles = {
    uploadInfo: join(tmp, "upload-info.json"),
    apiHealth: join(tmp, "api-health.json"),
    aHome: join(tmp, "a-home.png"),
    aFamily: join(tmp, "a-family.png"),
    aInvite: join(tmp, "a-invite.png"),
    bHome: join(tmp, "b-home.png"),
    bValid: join(tmp, "b-valid.png"),
    bJoined: join(tmp, "b-joined.png"),
    aMemberList: join(tmp, "a-member-list.png"),
  };

  writeFileSync(evidenceFiles.uploadInfo, JSON.stringify({ version: "tooling-smoke", success: true }));
  writeFileSync(
    evidenceFiles.apiHealth,
    JSON.stringify({
      checkedAt: "2026-06-09T08:00:00.000Z",
      apiBaseUrl: "https://example.invalid",
      healthUrl: "https://example.invalid/health",
      status: 200,
      body: '{"ok":true,"service":"nestful-api"}',
    }),
  );

  for (const file of Object.values(evidenceFiles)) {
    if (file !== evidenceFiles.uploadInfo && file !== evidenceFiles.apiHealth) {
      writeFileSync(file, "smoke evidence");
    }
  }

  const completePath = join(tmp, "record-complete.md");
  const completeRecord = replaceAll(readFileSync(draftPath, "utf8"), [
    ["| Upload time | TODO |", "| Upload time | 2026-06-09T08:00:00Z |"],
    ["| Upload info output | docs/experience-version-upload-info-tooling-smoke.json |", `| Upload info output | ${evidenceFiles.uploadInfo} |`],
    ["| API health output | docs/experience-version-api-health-tooling-smoke.json |", `| API health output | ${evidenceFiles.apiHealth} |`],
    ["| Experience version selected in admin console | TODO |", "| Experience version selected in admin console | selected |"],
    ["| Tester A alias | TODO |", "| Tester A alias | tester-a |"],
    ["| Tester B alias | TODO |", "| Tester B alias | tester-b |"],
    ["| Tester A added as experience member | TODO |", "| Tester A added as experience member | added |"],
    ["| Tester B added as experience member | TODO |", "| Tester B added as experience member | added |"],
    [
      "| Tester A opens the experience version home page | TODO |",
      `| Tester A opens the experience version home page | [home](${evidenceFiles.aHome}) |`,
    ],
    [
      "| Tester A creates a family and lands on the family overview | TODO |",
      `| Tester A creates a family and lands on the family overview | [family](${evidenceFiles.aFamily}) |`,
    ],
    [
      "| Tester A generates an invitation code or share card | TODO |",
      `| Tester A generates an invitation code or share card | [invite](${evidenceFiles.aInvite}) |`,
    ],
    [
      "| Tester B opens the same experience version | TODO |",
      `| Tester B opens the same experience version | [b-home](${evidenceFiles.bHome}) |`,
    ],
    [
      '| Tester B enters the invitation code and sees "邀请有效" | TODO |',
      `| Tester B enters the invitation code and sees "邀请有效" | [valid](${evidenceFiles.bValid}) |`,
    ],
    [
      "| Tester B joins with a display name | TODO |",
      `| Tester B joins with a display name | [joined](${evidenceFiles.bJoined}) |`,
    ],
    [
      '| Tester A sees Tester B in "家里人" | TODO |',
      `| Tester A sees Tester B in "家里人" | [member-list](${evidenceFiles.aMemberList}) |`,
    ],
    ["| Final result | TODO |", "| Final result | passed |"],
    ["| Family name | TODO |", "| Family name | 验收家庭 |"],
    ["| Invitation code or share-card path | TODO |", "| Invitation code or share-card path | /pages/join/index?code=abc123 |"],
    ["| Tester B display name | TODO |", "| Tester B display name | 测试B |"],
    ["| Failure notes | TODO |", "| Failure notes | none |"],
    ["passed on TODO", "passed on 2026-06-09"],
    ["Tester A: TODO, Tester B: TODO", "Tester A: tester-a, Tester B: tester-b"],
    ["created family TODO", "created family 验收家庭"],
    ["Evidence: TODO", `Evidence: [home](${evidenceFiles.aHome}).`],
  ]);
  writeFileSync(completePath, completeRecord);
  run(["scripts/experience-validation-record-check.mjs", completePath]);

  const missingEvidencePath = join(tmp, "record-missing-evidence.md");
  copyFileSync(completePath, missingEvidencePath);
  writeFileSync(
    missingEvidencePath,
    readFileSync(missingEvidencePath, "utf8").replace(evidenceFiles.aHome, join(tmp, "missing-a-home.png")),
  );
  expectFailure(["scripts/experience-validation-record-check.mjs", missingEvidencePath], "missing evidence record check");

  const notPassedPath = join(tmp, "record-not-passed.md");
  copyFileSync(completePath, notPassedPath);
  writeFileSync(notPassedPath, readFileSync(notPassedPath, "utf8").replace("| Final result | passed |", "| Final result | not passed |"));
  expectFailure(["scripts/experience-validation-record-check.mjs", notPassedPath], "not-passed record check");

  const badHealthPath = join(tmp, "record-bad-health.md");
  const badHealthJsonPath = join(tmp, "api-health-bad.json");
  writeFileSync(
    badHealthJsonPath,
    JSON.stringify({
      healthUrl: "https://example.invalid/health",
      status: 500,
      body: '{"ok":false}',
    }),
  );
  copyFileSync(completePath, badHealthPath);
  writeFileSync(badHealthPath, readFileSync(badHealthPath, "utf8").replace(evidenceFiles.apiHealth, badHealthJsonPath));
  expectFailure(["scripts/experience-validation-record-check.mjs", badHealthPath], "bad API health record check");

  const badUploadInfoPath = join(tmp, "record-bad-upload-info.md");
  const badUploadInfoJsonPath = join(tmp, "upload-info-bad.json");
  writeFileSync(
    badUploadInfoJsonPath,
    JSON.stringify({
      success: false,
      error: "upload failed",
    }),
  );
  copyFileSync(completePath, badUploadInfoPath);
  writeFileSync(
    badUploadInfoPath,
    readFileSync(badUploadInfoPath, "utf8").replace(evidenceFiles.uploadInfo, badUploadInfoJsonPath),
  );
  expectFailure(
    ["scripts/experience-validation-record-check.mjs", badUploadInfoPath],
    "bad upload info record check",
  );

  const duplicateTesterPath = join(tmp, "record-duplicate-tester.md");
  copyFileSync(completePath, duplicateTesterPath);
  writeFileSync(duplicateTesterPath, readFileSync(duplicateTesterPath, "utf8").replace("| Tester B alias | tester-b |", "| Tester B alias | tester-a |"));
  expectFailure(["scripts/experience-validation-record-check.mjs", duplicateTesterPath], "duplicate-tester record check");

  const incompleteNotePath = join(tmp, "record-incomplete-note.md");
  copyFileSync(completePath, incompleteNotePath);
  writeFileSync(incompleteNotePath, readFileSync(incompleteNotePath, "utf8").replace("passed on 2026-06-09", "passed on TODO"));
  expectFailure(["scripts/experience-validation-record-check.mjs", incompleteNotePath], "incomplete completion note check");

  console.log("experience validation tooling smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
