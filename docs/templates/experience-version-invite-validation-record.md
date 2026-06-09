# Experience-Version Invite Validation Record

Use this template with `docs/experience-version-invite-validation.md`. Keep one completed copy per uploaded experience-version build, and replace every placeholder before running the record checker on the completed copy.

## Build

| Field | Value |
| --- | --- |
| Git commit or working tree snapshot | TODO |
| WeChat AppID | TODO |
| Uploaded version label | TODO |
| Uploaded version description | TODO |
| Upload time | TODO |
| Upload info output | TODO |
| API health output | TODO |
| Experience version selected in admin console | TODO |
| Production/trial API base URL | TODO |

## Testers

Tester aliases must identify two distinct WeChat experience-member accounts.

| Field | Value |
| --- | --- |
| Tester A alias | TODO |
| Tester B alias | TODO |
| Tester A added as experience member | TODO |
| Tester B added as experience member | TODO |

## Evidence

Each evidence value must be an `http(s)` URL, an existing local file path, or a Markdown link to one of those targets. Multiple references can be separated with commas. Local `Upload info output` and `API health output` files must be JSON evidence that passes `npm run experience:record-check -- <record>`.

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

```text
Experience-version invite validation passed on TODO.
Build: TODO, commit/snapshot: TODO.
Tester A: TODO, Tester B: TODO.
Result: Tester A created family TODO, generated invite, Tester B joined, Tester A confirmed Tester B in member list.
Evidence: TODO.
```
