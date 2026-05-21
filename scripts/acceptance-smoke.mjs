const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3100";

const request = async (path, options = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
};

const requestFailure = async (path, options = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const body = await response.json();

  if (response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} unexpectedly succeeded: ${JSON.stringify(body)}`);
  }

  return { status: response.status, body };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const health = await request("/health");
assert(health.ok === true, "health check did not return ok");

const familyResponse = await request("/v1/families", {
  method: "POST",
  body: JSON.stringify({
    name: "验收家庭",
    ownerUserId: `acceptance-${Date.now()}`,
    ownerDisplayName: "验收人",
  }),
});

const { family, ownerMember } = familyResponse.data;
assert(family.id, "family id missing");
assert(ownerMember.id, "owner member id missing");

const membersResponse = await request(`/v1/families/${family.id}/members`);
assert(membersResponse.data.length === 1, "owner member was not created");

const invitationResponse = await request(`/v1/families/${family.id}/invitations`, {
  method: "POST",
  body: JSON.stringify({
    createdByMemberId: ownerMember.id,
    role: "member",
  }),
});

const { invitation, joinPath } = invitationResponse.data;
assert(invitation.code, "invitation code missing");
assert(joinPath.includes(invitation.code), "join path does not include invitation code");

const otherFamilyResponse = await request("/v1/families", {
  method: "POST",
  body: JSON.stringify({
    name: "越权测试家庭",
    ownerUserId: `privacy-${Date.now()}`,
    ownerDisplayName: "越权测试人",
  }),
});

const invalidInvitationResponse = await requestFailure(`/v1/families/${otherFamilyResponse.data.family.id}/invitations`, {
  method: "POST",
  body: JSON.stringify({
    createdByMemberId: ownerMember.id,
    role: "member",
  }),
});

assert(invalidInvitationResponse.status === 400, "cross-family invitation should be rejected");
assert(
  invalidInvitationResponse.body.error === "invalid_creator_member",
  "cross-family invitation returned unexpected error",
);

const acceptResponse = await request(`/v1/invitations/${invitation.code}/accept`, {
  method: "POST",
  body: JSON.stringify({
    displayName: "家人",
    userId: `family-${Date.now()}`,
    emergencyContact: "13800000000",
  }),
});

assert(acceptResponse.data.member.id, "accepted member id missing");

const finalMembersResponse = await request(`/v1/families/${family.id}/members`);
assert(finalMembersResponse.data.length === 2, "accepted member was not added");
assert(
  finalMembersResponse.data.every((member) => member.emergencyContact === undefined),
  "member list should redact emergency contacts",
);

const auditResponse = await request(`/v1/families/${family.id}/audit-events`);
const auditActions = auditResponse.data.map((event) => event.action);
assert(auditActions.includes("family.created"), "family creation audit event missing");
assert(auditActions.includes("invitation.created"), "invitation creation audit event missing");
assert(auditActions.includes("invitation.accepted"), "invitation acceptance audit event missing");

const reminderResponse = await request(`/v1/families/${family.id}/reminders`, {
  method: "POST",
  body: JSON.stringify({
    type: "medicine",
    title: "提醒吃药",
    dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdByMemberId: ownerMember.id,
    assigneeMemberId: ownerMember.id,
  }),
});

assert(reminderResponse.data.id, "reminder id missing");
assert(reminderResponse.data.completedAt === undefined, "new reminder should not be completed");

const remindersResponse = await request(`/v1/families/${family.id}/reminders`);
assert(remindersResponse.data.some((reminder) => reminder.id === reminderResponse.data.id), "reminder list missing new reminder");

const completeReminderResponse = await request(`/v1/reminders/${reminderResponse.data.id}/complete`, {
  method: "POST",
  body: JSON.stringify({
    actorMemberId: ownerMember.id,
  }),
});

assert(completeReminderResponse.data.completedAt, "completed reminder missing completedAt");

const ledgerEntryResponse = await request(`/v1/families/${family.id}/ledger-entries`, {
  method: "POST",
  body: JSON.stringify({
    type: "expense",
    category: "daily",
    title: "家庭日常支出",
    amountCents: 2000,
    paidByMemberId: ownerMember.id,
    occurredAt: new Date().toISOString(),
  }),
});

assert(ledgerEntryResponse.data.id, "ledger entry id missing");
assert(ledgerEntryResponse.data.amountCents === 2000, "ledger entry amount mismatch");

const ledgerEntriesResponse = await request(`/v1/families/${family.id}/ledger-entries`);
assert(
  ledgerEntriesResponse.data.some((entry) => entry.id === ledgerEntryResponse.data.id),
  "ledger list missing new entry",
);

const digitalSpaceItemResponse = await request(`/v1/families/${family.id}/digital-space-items`, {
  method: "POST",
  body: JSON.stringify({
    kind: "memory",
    title: "一次家庭出行",
    summary: "周末一起出门散步的记忆",
    url: "https://example.com/family-memory",
    createdByMemberId: ownerMember.id,
  }),
});

assert(digitalSpaceItemResponse.data.id, "digital space item id missing");
assert(digitalSpaceItemResponse.data.kind === "memory", "digital space item kind mismatch");

const digitalSpaceItemsResponse = await request(`/v1/families/${family.id}/digital-space-items`);
assert(
  digitalSpaceItemsResponse.data.some((item) => item.id === digitalSpaceItemResponse.data.id),
  "digital space list missing new item",
);

console.log("acceptance smoke passed");
console.log(
  JSON.stringify(
    {
      familyId: family.id,
      invitationCode: invitation.code,
      members: finalMembersResponse.data.length,
      auditEvents: auditResponse.data.length,
      reminderId: reminderResponse.data.id,
      ledgerEntryId: ledgerEntryResponse.data.id,
      digitalSpaceItemId: digitalSpaceItemResponse.data.id,
    },
    null,
    2,
  ),
);
