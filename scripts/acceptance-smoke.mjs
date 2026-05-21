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

console.log("acceptance smoke passed");
console.log(
  JSON.stringify(
    {
      familyId: family.id,
      invitationCode: invitation.code,
      members: finalMembersResponse.data.length,
      auditEvents: auditResponse.data.length,
    },
    null,
    2,
  ),
);
