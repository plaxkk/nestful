# Release Quality Gate

Last updated: 2026-06-09

## Automated Checks

These checks passed locally:

```bash
npm run release:quality-gate
```

`release:quality-gate` runs the full local handoff gate by executing `release:local-gate` and then `release:runtime-smoke`.

`release:local-gate` runs the offline checks in a deterministic order: release script syntax checks, typecheck, tests, lint, migration smoke, static mini-program smoke, experience preflight, record template check, and experience tooling smoke. It stops at the first failing check and does not create WeChat artifacts.

`release:runtime-smoke` starts the local API when needed, runs `acceptance:smoke`, starts WeChat DevTools automation when needed, runs `miniprogram:devtools-smoke`, and cleans up the local API/DevTools instances it started. It does not preview or upload.

`experience:record-check` validates the reusable experience-version evidence template. After a real experience-version run, pass the completed record path to the same command before marking the external invite validation complete. Completed records must reference a valid upload-info JSON output and API-health JSON output when those evidence files are kept locally.

`experience:preflight` verifies the AppID, `miniprogramRoot`, trial/release public HTTPS API URLs, required scripts, record template checker, and upload-plan traceability output before an approved experience-version upload. A dirty working tree is reported as a warning so WIP snapshots are explicit. The default command is offline; run `npm run experience:preflight -- --check-api-health --health-output <path>` before upload to verify the trial API `/health` endpoint is reachable and write evidence for the completed record.

Use `npm run experience:upload-plan` to print the health-check command, record-draft command, approved-upload command, upload info path, working-tree traceability warning, and completed-record check command for the current working tree. The real upload time, upload info output, and API health output are required fields in the completed record.

`experience:tooling-smoke` exercises the local upload-plan, record-draft, and record-check tooling with temporary records. It does not upload to WeChat.

## WeChat DevTools CLI Checks

These local DevTools checks were run:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project /Users/kk/repos/nestful --port 9420 --disable-gpu
/Applications/wechatwebdevtools.app/Contents/MacOS/cli build-npm --project /Users/kk/repos/nestful --port 9420
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto --project /Users/kk/repos/nestful --port 9420 --auto-port 9421 --trust-project --disable-gpu
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto-replay --project /Users/kk/repos/nestful --port 9420 --replay-all --trust-project --disable-gpu
/Applications/wechatwebdevtools.app/Contents/MacOS/cli quit --port 9420
```

Results:

- Project opened successfully after enabling the DevTools service port.
- `build-npm` returned `__NO_NODE_MODULES__`, which is non-blocking because this mini-program has no `miniprogramRoot` npm package build.
- Automation opened and finished on `ws://127.0.0.1:9421`.
- `npm run miniprogram:devtools-smoke` passed against SDK `3.16.1`; it created a family in the mini-program runtime, generated an invitation code, validated the join route, and exercised reminder, ledger, digital-space, and activity page creation flows.
- A local structural mini-program smoke also passed with `npm run miniprogram:smoke`; it verifies the expected page entries, forms, buttons, and event bindings are present for onboarding, invite, reminders, ledger, digital space, and activities.

## External Checks Not Run Automatically

These checks require explicit release approval and real WeChat testers:

- DevTools `preview` or `upload`, because they can create external WeChat artifacts.
- Experience-version invite validation with at least two tester WeChat accounts.

Before real family testing, complete the experience-version checklist in `docs/acceptance-checklist.md` and record evidence with `docs/experience-version-invite-validation.md`.
