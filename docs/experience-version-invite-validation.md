# Experience-Version Invite Validation

Last updated: 2026-06-09

Use this runbook only after all local automated checks in `docs/release-quality-gate.md` pass. This check validates the WeChat experience version with two real tester accounts before real family testing.

## Required Evidence

Record these fields before marking the TODO item complete:

| Field | Value |
| --- | --- |
| Git commit or working tree snapshot |  |
| WeChat AppID |  |
| Uploaded version label |  |
| Uploaded version description |  |
| Upload time |  |
| Upload info output |  |
| API health output |  |
| Experience version selected in admin console |  |
| Tester A alias |  |
| Tester B alias |  |
| Tester A added as experience member |  |
| Tester B added as experience member |  |
| Production/trial API base URL |  |
| Final result |  |

Keep screenshots or short screen recordings for these moments:

- Tester A opens the experience version home page.
- Tester A creates a family and lands on the family overview.
- Tester A generates an invitation code or share card.
- Tester B opens the same experience version.
- Tester B enters the invitation code and sees "邀请有效".
- Tester B joins with a display name.
- Tester A sees Tester B in "家里人".

Tester A and Tester B must be two distinct WeChat accounts. The completed record checker rejects duplicate tester aliases.

Evidence entries in the completed record must be `http(s)` URLs, existing local file paths, or Markdown links to one of those targets. Multiple evidence references can be separated with commas.

`Upload info output` should reference the JSON file written by the WeChat DevTools `upload --info-output <path>` command from the generated upload plan. When it is a local file, the completed-record checker validates that it is a non-empty JSON object and does not report an obvious failed upload state.

`API health output` should reference the JSON file written by `npm run experience:preflight -- --check-api-health --health-output <path>`. When it is a local file, the completed-record checker validates that it is JSON with a valid `healthUrl`, a 2xx `status`, and no `ok:false` health body.

Copy `docs/templates/experience-version-invite-validation-record.md` for the actual build, fill every `TODO`, and validate the completed record:

```bash
npm run experience:record-check -- docs/experience-version-invite-validation-record-<version>.md
```

To prefill build metadata from the current repository state, generate a draft record before uploading:

```bash
npm run experience:upload-plan
npm run experience:record-draft -- --output docs/experience-version-invite-validation-record-<version>.md
```

The default command checks that the reusable template still contains every required row:

```bash
npm run experience:record-check
```

## Preconditions

1. Local quality gate is green:

   ```bash
   npm run release:quality-gate
   ```

2. The target API is reachable from WeChat trial/experience devices.
3. `WECHAT_MINIPROGRAM_STATE` is `trial` for experience-version links.
4. The backend has the required WeChat login credentials for the target AppID if testing real identity binding.
5. Tester A and Tester B are different WeChat accounts and both are configured as experience members.

## Upload

DevTools preview and upload create external WeChat artifacts. Run this section only with explicit release approval.

1. Run `npm run experience:preflight` and resolve any failures.
2. Run `npm run release:quality-gate` and resolve any failures.
3. Run `npm run experience:preflight -- --check-api-health --health-output docs/experience-version-api-health-<version>.json` from a network that can reach the trial API.
4. Generate the upload plan with `npm run experience:upload-plan`.
5. Generate the validation record draft from that plan.
6. If the upload plan reports a dirty working tree, either commit/stash first or keep that WIP snapshot string and upload info output in the completed validation record.
7. Open WeChat DevTools for `/Users/kk/repos/nestful`.
8. Confirm the project is using the expected AppID.
9. After explicit release approval, run the upload command from the plan.
10. In the mini-program admin console, select the uploaded build as the experience version.
11. Add Tester A and Tester B as experience members.
12. Share the experience-version QR code or entry link with both testers.

## Test Steps

Tester A:

1. Open the experience version.
2. Confirm the first screen shows the create-family and join-by-code choices.
3. Tap "创建我的家庭".
4. Create a family with a unique name.
5. Confirm the family overview shows the family name and member count.
6. Generate a family invitation.
7. Copy or share the invitation code with Tester B.

Tester B:

1. Open the same experience version.
2. Tap "输入邀请码加入".
3. Enter Tester A's invitation code.
4. Confirm the page shows "邀请有效".
5. Enter a display name.
6. Join the family.
7. Confirm the app lands on the family overview.

Tester A:

1. Return to the family overview.
2. Refresh/reopen the family page if needed.
3. Confirm Tester B appears in "家里人".
4. Create one reminder, one ledger entry, one digital-space item, and one activity if doing a final smoke pass on the same build.

## Pass Criteria

The experience-version invite validation passes only if all of these are true:

- Both tester accounts can open the same experience version.
- Tester A can create a family.
- Tester A can generate an invitation code or share card.
- Tester B can validate the code as active.
- Tester B can join with a display name.
- Tester A can see Tester B in the member list.
- No tester sees an expired development-preview build warning.
- Any failure has a screenshot, timestamp, tester alias, and the exact page/action where it happened.

## Failure Triage

| Symptom | Check |
| --- | --- |
| `experience:preflight -- --check-api-health` fails | Do not upload yet. Confirm the trial API domain, TLS certificate, deployment health, and the network path from the machine running DevTools. |
| Tester sees preview expired warning | Confirm they are using the experience version, not a DevTools preview QR code. |
| Tester cannot open build | Confirm tester account is added as an experience member. |
| Login or create family fails | Confirm target API URL, WeChat AppID/secret, and backend availability. |
| Invitation says invalid | Confirm Tester B uses the latest code from Tester A and the invitation has not been canceled/used/expired. |
| Tester B joins but Tester A cannot see them | Reopen Tester A's family page, then inspect backend family/member records for the same family ID. |

## Completion Note Template

Paste this into the release notes or TODO handoff after the external run:

```text
Experience-version invite validation passed on <date>.
Build: <version label>, commit/snapshot: <sha or description>.
Tester A: <alias>, Tester B: <alias>.
Result: Tester A created family <family name>, generated invite, Tester B joined, Tester A confirmed Tester B in member list.
Evidence: <screenshot/recording paths or links>.
```
