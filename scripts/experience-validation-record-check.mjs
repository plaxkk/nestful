import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const defaultTemplatePath = "docs/templates/experience-version-invite-validation-record.md";
const targetPath = process.argv[2] ?? defaultTemplatePath;
const isTemplateCheck = targetPath === defaultTemplatePath && process.argv[2] === undefined;

const requiredFields = [
  "Git commit or working tree snapshot",
  "WeChat AppID",
  "Uploaded version label",
  "Uploaded version description",
  "Upload time",
  "Upload info output",
  "API health output",
  "Experience version selected in admin console",
  "Production/trial API base URL",
  "Tester A alias",
  "Tester B alias",
  "Tester A added as experience member",
  "Tester B added as experience member",
  "Final result",
  "Family name",
  "Invitation code or share-card path",
  "Tester B display name",
  "Failure notes",
];

const requiredEvidence = [
  "Tester A opens the experience version home page",
  "Tester A creates a family and lands on the family overview",
  "Tester A generates an invitation code or share card",
  "Tester B opens the same experience version",
  'Tester B enters the invitation code and sees "邀请有效"',
  "Tester B joins with a display name",
  'Tester A sees Tester B in "家里人"',
];

const positiveFields = [
  "Experience version selected in admin console",
  "Tester A added as experience member",
  "Tester B added as experience member",
];

const requiredReferenceFields = ["Upload info output", "API health output"];

const path = resolve(targetPath);
const content = readFileSync(path, "utf8");
const recordDir = dirname(path);
const missing = [];

const evidenceReferencesFor = (value) =>
  value
    .split(",")
    .map((item) => {
      const trimmed = item.trim();
      const markdownLink = trimmed.match(/^\[[^\]]+\]\(([^)]+)\)$/);

      return markdownLink ? markdownLink[1].trim() : trimmed;
    })
    .filter(Boolean);

const referenceTargets = (reference) => {
  if (/^https?:\/\/\S+$/i.test(reference)) {
    return [{ type: "url", value: reference }];
  }

  return [
    isAbsolute(reference) ? reference : resolve(recordDir, reference),
    isAbsolute(reference) ? reference : resolve(reference),
  ].map((value) => ({ type: "path", value }));
};

const existingReferenceFor = (field, rows) => {
  const references = evidenceReferencesFor(rows.get(field) ?? "");

  for (const reference of references) {
    for (const target of referenceTargets(reference)) {
      if (target.type === "url") {
        return target;
      }

      if (existsSync(target.value)) {
        return target;
      }
    }
  }

  return undefined;
};

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const validateUploadInfoEvidence = (rows) => {
  const target = existingReferenceFor("Upload info output", rows);

  if (!target || target.type === "url") {
    return;
  }

  let evidence;

  try {
    evidence = JSON.parse(readFileSync(target.value, "utf8"));
  } catch (error) {
    throw new Error(`Upload info output must be valid JSON when it references a local file: ${error.message}`);
  }

  if (!isPlainObject(evidence)) {
    throw new Error("Upload info output JSON must be a non-empty object.");
  }

  if (Object.keys(evidence).length === 0) {
    throw new Error("Upload info output JSON must not be empty.");
  }

  if (evidence.success === false || evidence.ok === false) {
    throw new Error("Upload info output JSON reports success=false or ok=false.");
  }

  if (Number.isInteger(evidence.status) && evidence.status >= 400) {
    throw new Error(`Upload info output JSON reports failing status ${evidence.status}.`);
  }

  if (Number.isInteger(evidence.statusCode) && evidence.statusCode >= 400) {
    throw new Error(`Upload info output JSON reports failing statusCode ${evidence.statusCode}.`);
  }

  if (Number.isInteger(evidence.errCode) && evidence.errCode !== 0) {
    throw new Error(`Upload info output JSON reports errCode ${evidence.errCode}.`);
  }

  if (Number.isInteger(evidence.errorCode) && evidence.errorCode !== 0) {
    throw new Error(`Upload info output JSON reports errorCode ${evidence.errorCode}.`);
  }

  const failureText = [evidence.error, evidence.errMsg, evidence.message, evidence.status]
    .filter((value) => typeof value === "string")
    .join("\n");

  if (/\b(?:fail(?:ed)?|error|exception|denied|invalid)\b/i.test(failureText)) {
    throw new Error("Upload info output JSON contains an obvious failure message.");
  }

  const expectedVersion = rows.get("Uploaded version label")?.trim();
  const reportedVersion =
    evidence.versionLabel ?? evidence.version_label ?? evidence.uploadVersion ?? evidence.upload_version;

  if (
    expectedVersion &&
    typeof reportedVersion === "string" &&
    reportedVersion.trim() &&
    reportedVersion.trim() !== expectedVersion
  ) {
    throw new Error(
      `Upload info output JSON reports version ${reportedVersion}, but the validation record expects ${expectedVersion}.`,
    );
  }
};

const validateApiHealthEvidence = (rows) => {
  const target = existingReferenceFor("API health output", rows);

  if (!target || target.type === "url") {
    return;
  }

  let evidence;

  try {
    evidence = JSON.parse(readFileSync(target.value, "utf8"));
  } catch (error) {
    throw new Error(`API health output must be valid JSON when it references a local file: ${error.message}`);
  }

  if (typeof evidence.healthUrl !== "string") {
    throw new Error("API health output JSON must include healthUrl.");
  }

  try {
    new URL(evidence.healthUrl);
  } catch {
    throw new Error(`API health output JSON has an invalid healthUrl: ${evidence.healthUrl}`);
  }

  if (!Number.isInteger(evidence.status) || evidence.status < 200 || evidence.status >= 300) {
    throw new Error(`API health output JSON must include a 2xx integer status, got ${evidence.status}.`);
  }

  if (typeof evidence.body === "string" && evidence.body.trim()) {
    try {
      const body = JSON.parse(evidence.body);

      if (body.ok === false) {
        throw new Error("API health output body reports ok=false.");
      }
    } catch (error) {
      if (error.message === "API health output body reports ok=false.") {
        throw error;
      }
    }
  }
};

for (const field of [...requiredFields, ...requiredEvidence]) {
  if (!content.includes(`| ${field} |`)) {
    missing.push(field);
  }
}

if (missing.length > 0) {
  throw new Error(`Experience validation record is missing required rows: ${missing.join(", ")}`);
}

if (!isTemplateCheck) {
  const placeholderMatches = content.match(/\bTODO\b|<[^>\n]+>/gi) ?? [];

  if (placeholderMatches.length > 0) {
    throw new Error("Experience validation record still contains TODO or <placeholder> markers.");
  }

  const rows = new Map();

  for (const line of content.split("\n")) {
    if (!line.startsWith("| ") || line.includes("| --- |")) {
      continue;
    }

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length >= 2) {
      rows.set(cells[0], cells.slice(1).join(" | "));
    }
  }

  const unresolvedFields = [];

  for (const field of [...requiredFields, ...requiredEvidence]) {
    const value = rows.get(field) ?? "";

    if (!value || /\bTODO\b/i.test(value)) {
      unresolvedFields.push(field);
    }
  }

  if (unresolvedFields.length > 0) {
    throw new Error(`Experience validation record has unresolved fields: ${unresolvedFields.join(", ")}`);
  }

  const testerAAlias = rows.get("Tester A alias")?.trim() ?? "";
  const testerBAlias = rows.get("Tester B alias")?.trim() ?? "";

  if (testerAAlias.localeCompare(testerBAlias, undefined, { sensitivity: "accent" }) === 0) {
    throw new Error("Experience validation record must use two distinct tester aliases.");
  }

  const missingReferenceFields = [];

  for (const field of requiredReferenceFields) {
    if (!existingReferenceFor(field, rows)) {
      missingReferenceFields.push(field);
    }
  }

  if (missingReferenceFields.length > 0) {
    throw new Error(
      `Experience validation record must reference an http(s) URL or existing file path for: ${missingReferenceFields.join(", ")}`,
    );
  }

  validateApiHealthEvidence(rows);
  validateUploadInfoEvidence(rows);

  const nonPositiveFields = positiveFields.filter((field) => {
    const value = rows.get(field) ?? "";

    return !/^(yes|true|added|selected|done|是|已添加|已选择|完成|通过)$/i.test(value);
  });

  if (nonPositiveFields.length > 0) {
    throw new Error(
      `Experience validation record must confirm these fields with yes/true/added/selected/done/是/已添加/已选择/完成/通过: ${nonPositiveFields.join(", ")}`,
    );
  }

  const finalResult = rows.get("Final result") ?? "";
  const isNegativeResult = /\b(not|fail(?:ed)?|blocked|incomplete|未通过|失败|未完成)\b/i.test(finalResult);
  const isPositiveResult = /^(pass|passed|通过)$/i.test(finalResult);

  if (isNegativeResult || !isPositiveResult) {
    throw new Error('Experience validation record must mark "Final result" exactly as passed, pass, or 通过.');
  }

  const missingEvidenceReferences = [];

  for (const field of requiredEvidence) {
    const value = rows.get(field) ?? "";
    const references = evidenceReferencesFor(value);

    const hasValidReference = references.some((reference) => {
      return referenceTargets(reference).some((target) => target.type === "url" || existsSync(target.value));
    });

    if (!hasValidReference) {
      missingEvidenceReferences.push(field);
    }
  }

  if (missingEvidenceReferences.length > 0) {
    throw new Error(
      `Experience validation evidence must be an http(s) URL or existing file path for: ${missingEvidenceReferences.join(", ")}`,
    );
  }
}

console.log(
  isTemplateCheck
    ? "experience validation record template check passed"
    : "experience validation record check passed",
);
