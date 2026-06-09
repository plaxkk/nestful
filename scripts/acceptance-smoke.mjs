const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3100";

const request = async (path, options = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
    },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
};

const requestFailure = async (path, options = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
    },
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

const assertFailure = async (path, options, expectedStatus, expectedError, message) => {
  const result = await requestFailure(path, options);

  assert(result.status === expectedStatus, `${message}: expected ${expectedStatus}, received ${result.status}`);
  assert(result.body.error === expectedError, `${message}: expected ${expectedError}, received ${result.body.error}`);

  return result;
};

const assertDaysApart = (from, to, days, message) => {
  assert(Date.parse(to) - Date.parse(from) === days * 24 * 60 * 60 * 1000, message);
};

const assertNextYearSameUtcDay = (from, to, message) => {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  assert(toDate.getUTCFullYear() === fromDate.getUTCFullYear() + 1, `${message}: year mismatch`);
  assert(toDate.getUTCMonth() === fromDate.getUTCMonth(), `${message}: month mismatch`);
  assert(toDate.getUTCDate() === fromDate.getUTCDate(), `${message}: day mismatch`);
};

const createSmokeSession = async (label) => {
  const response = await request("/v1/wechat/session", {
    method: "POST",
    body: JSON.stringify({
      code: `local-smoke-code-${label}-${Date.now()}`,
    }),
  });

  assert(response.data.userId, `${label} session should include userId`);
  assert(response.data.token, `${label} session should include app session token`);
  assert(response.data.user?.id === response.data.userId, `${label} session user should match userId`);
  assert(!Number.isNaN(Date.parse(response.data.expiresAt)), `${label} session should include valid expiresAt`);

  return response.data;
};

const authHeadersFor = (session) => ({
  authorization: `Bearer ${session.token}`,
});

const health = await request("/health");
assert(health.ok === true, "health check did not return ok");

const ownerSession = await createSmokeSession("owner");
const joinSession = await createSmokeSession("join");
const canceledInviteSession = await createSmokeSession("canceled-invite");
const ownerAuthHeaders = authHeadersFor(ownerSession);
const joinAuthHeaders = authHeadersFor(joinSession);
const canceledInviteAuthHeaders = authHeadersFor(canceledInviteSession);

if (!process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) {
  assert(ownerSession.configured === false, "local WeChat session should report unconfigured credentials");
}

await assertFailure(
  "/v1/families",
  {
    method: "POST",
    body: JSON.stringify({
      name: "未登录家庭",
      ownerUserId: ownerSession.userId,
      ownerDisplayName: "未登录人",
    }),
  },
  401,
  "unauthorized",
  "family creation should require an app session token",
);

await assertFailure(
  "/v1/families",
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify(null),
  },
  400,
  "body_required",
  "family creation should require an object body",
);

await assertFailure(
  "/v1/families",
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      name: "缺字段家庭",
    }),
  },
  400,
  "missing_required_fields",
  "family creation should require owner fields",
);

const familyResponse = await request("/v1/families", {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    name: "验收家庭",
    ownerUserId: ownerSession.userId,
    ownerWechatOpenId: ownerSession.wechatOpenId,
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
  headers: ownerAuthHeaders,
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
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    name: "越权测试家庭",
    ownerUserId: ownerSession.userId,
    ownerWechatOpenId: ownerSession.wechatOpenId,
    ownerDisplayName: "越权测试人",
  }),
});

await assertFailure(
  `/v1/families/${otherFamilyResponse.data.family.id}/invitations`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      createdByMemberId: ownerMember.id,
      role: "member",
    }),
  },
  403,
  "forbidden",
  "cross-family invitation creation should be forbidden",
);

const expiredInvitationResponse = await request(`/v1/families/${family.id}/invitations`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    createdByMemberId: ownerMember.id,
    role: "member",
    expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
  }),
});

await assertFailure(
  `/v1/invitations/${expiredInvitationResponse.data.invitation.code}/accept`,
  {
    method: "POST",
    headers: joinAuthHeaders,
    body: JSON.stringify({
      displayName: "过期加入",
    }),
  },
  404,
  "invitation_unavailable",
  "expired invitation should not be accepted",
);

const cancelInvitationResponse = await request(`/v1/families/${family.id}/invitations`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    createdByMemberId: ownerMember.id,
    role: "member",
  }),
});

const canceledInvitationResponse = await request(
  `/v1/families/${family.id}/invitations/${cancelInvitationResponse.data.invitation.id}`,
  {
    method: "DELETE",
    headers: ownerAuthHeaders,
  },
);

assert(canceledInvitationResponse.data.status === "canceled", "cancelled invitation should report canceled status");

await assertFailure(
  `/v1/invitations/${cancelInvitationResponse.data.invitation.code}/accept`,
  {
    method: "POST",
    headers: canceledInviteAuthHeaders,
    body: JSON.stringify({
      displayName: "撤销后加入",
    }),
  },
  404,
  "invitation_unavailable",
  "canceled invitation should not be accepted",
);

await assertFailure(
  `/v1/families/${family.id}/members`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      createdByMemberId: otherFamilyResponse.data.ownerMember.id,
      displayName: "越权成员",
    }),
  },
  403,
  "forbidden",
  "cross-family direct member creation should be forbidden",
);

const acceptResponse = await request(`/v1/invitations/${invitation.code}/accept`, {
  method: "POST",
  headers: joinAuthHeaders,
  body: JSON.stringify({
    displayName: "家人",
    emergencyContact: "13800000000",
  }),
});

assert(acceptResponse.data.member.id, "accepted member id missing");

await assertFailure(
  `/v1/invitations/${invitation.code}/accept`,
  {
    method: "POST",
    headers: joinAuthHeaders,
    body: JSON.stringify({
      displayName: "重复加入",
    }),
  },
  404,
  "invitation_unavailable",
  "used invitation should not be accepted twice",
);

const finalMembersResponse = await request(`/v1/families/${family.id}/members`);
assert(finalMembersResponse.data.length === 2, "accepted member was not added");
assert(
  finalMembersResponse.data.every((member) => member.emergencyContact === undefined),
  "member list should redact emergency contacts",
);

const ownerViewOfJoinedMember = await request(`/v1/families/${family.id}/members/${acceptResponse.data.member.id}`, {
  headers: ownerAuthHeaders,
});

assert(
  ownerViewOfJoinedMember.data.emergencyContact === "13800000000",
  "admin member detail should include emergency contact",
);

const joinedMemberSelfView = await request(`/v1/families/${family.id}/members/${acceptResponse.data.member.id}`, {
  headers: joinAuthHeaders,
});

assert(
  joinedMemberSelfView.data.emergencyContact === "13800000000",
  "self member detail should include emergency contact",
);

await assertFailure(
  `/v1/families/${family.id}/members/${acceptResponse.data.member.id}`,
  {
    method: "PUT",
    headers: joinAuthHeaders,
    body: JSON.stringify({
      displayName: "想当管理员",
      role: "admin",
    }),
  },
  403,
  "forbidden",
  "non-admin member should not be allowed to change their role",
);

const updatedJoinedMemberResponse = await request(`/v1/families/${family.id}/members/${acceptResponse.data.member.id}`, {
  method: "PUT",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    displayName: "家人长辈",
    role: "elder",
    birthday: "1965-03-12",
    birthdayCalendar: "lunar",
    location: "上海",
    emergencyContact: "13900000000",
  }),
});

assert(updatedJoinedMemberResponse.data.role === "elder", "admin should be able to update member role");
assert(updatedJoinedMemberResponse.data.birthdayCalendar === "lunar", "member birthday calendar should update");
assert(updatedJoinedMemberResponse.data.emergencyContact === "13900000000", "admin update should preserve sensitive detail");

await assertFailure(
  `/v1/families/${family.id}/members/${ownerMember.id}`,
  {
    method: "PUT",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      displayName: "验收人",
      role: "member",
    }),
  },
  400,
  "last_admin_required",
  "last admin should not be downgraded",
);

const temporaryMemberResponse = await request(`/v1/families/${family.id}/members`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    createdByMemberId: ownerMember.id,
    displayName: "临时家人",
    role: "guest",
  }),
});

assert(temporaryMemberResponse.data.id, "direct member creation should return member id");

const removedMemberResponse = await request(`/v1/families/${family.id}/members/${temporaryMemberResponse.data.id}`, {
  method: "DELETE",
  headers: ownerAuthHeaders,
});

assert(removedMemberResponse.data.id === temporaryMemberResponse.data.id, "member removal should return removed member");

await assertFailure(
  `/v1/families/${family.id}/invitations`,
  {
    method: "POST",
    headers: joinAuthHeaders,
    body: JSON.stringify({
      createdByMemberId: ownerMember.id,
      role: "member",
    }),
  },
  403,
  "forbidden",
  "app session token should not be allowed to impersonate another member",
);

await assertFailure(
  `/v1/families/${family.id}/invitations`,
  {
    method: "GET",
    headers: joinAuthHeaders,
  },
  403,
  "forbidden",
  "non-admin members should not list invitation codes",
);

const invitationsResponse = await request(`/v1/families/${family.id}/invitations`, {
  headers: ownerAuthHeaders,
});

const invitationStatuses = invitationsResponse.data.map((item) => item.status);
assert(invitationStatuses.includes("accepted"), "invitation list should include accepted invitations");
assert(invitationStatuses.includes("expired"), "invitation list should include expired invitations");
assert(invitationStatuses.includes("canceled"), "invitation list should include canceled invitations");

const auditResponse = await request(`/v1/families/${family.id}/audit-events`);
const auditActions = auditResponse.data.map((event) => event.action);
assert(auditActions.includes("family.created"), "family creation audit event missing");
assert(auditActions.includes("invitation.created"), "invitation creation audit event missing");
assert(auditActions.includes("invitation.accepted"), "invitation acceptance audit event missing");
assert(auditActions.includes("member.updated"), "member update audit event missing");
assert(auditActions.includes("member.removed"), "member removal audit event missing");
assert(auditActions.includes("invitation.cancelled"), "invitation cancellation audit event missing");

const reminderSubscriptionConfigResponse = await request("/v1/reminders/subscription-config");
assert(
  typeof reminderSubscriptionConfigResponse.data.enabled === "boolean",
  "reminder subscription config should expose enabled flag",
);

await assertFailure(
  `/v1/families/${family.id}/reminders`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      type: "medicine",
      title: "错误日期",
      dueAt: "not-a-date",
      createdByMemberId: ownerMember.id,
    }),
  },
  400,
  "invalid_due_at",
  "reminder creation should reject invalid dueAt",
);

await assertFailure(
  `/v1/families/${family.id}/reminders`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      type: "medicine",
      title: "越权对象",
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdByMemberId: ownerMember.id,
      assigneeMemberId: otherFamilyResponse.data.ownerMember.id,
    }),
  },
  400,
  "invalid_assignee_member",
  "reminder creation should reject cross-family assignees",
);

await assertFailure(
  `/v1/families/${family.id}/reminders`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      type: "medicine",
      title: "越权通知接收人",
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdByMemberId: ownerMember.id,
      assigneeMemberId: ownerMember.id,
      notificationSubscription: {
        templateId: "test-template",
        recipientMemberId: otherFamilyResponse.data.ownerMember.id,
        subscriptionStatus: "reject",
      },
    }),
  },
  400,
  "invalid_notification_recipient",
  "reminder creation should reject cross-family notification recipients",
);

await assertFailure(
  `/v1/families/${family.id}/reminders`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      type: "medicine",
      title: "越权通知授权",
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdByMemberId: ownerMember.id,
      assigneeMemberId: ownerMember.id,
      notificationSubscription: {
        templateId: "test-template",
        recipientMemberId: acceptResponse.data.member.id,
        subscriptionStatus: "accept",
      },
    }),
  },
  403,
  "forbidden",
  "accepted reminder subscriptions should require the recipient actor session",
);

const reminderResponse = await request(`/v1/families/${family.id}/reminders`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    type: "medicine",
    title: "提醒吃药",
    dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdByMemberId: ownerMember.id,
    assigneeMemberId: ownerMember.id,
    targetScope: "member",
    targetMemberIds: [ownerMember.id],
    frequency: "daily_twice",
    schedule: {
      targetLabel: "验收人",
      frequencyLabel: "每天两次",
      timesOfDay: ["08:00", "20:00"],
    },
    notificationSubscription: {
      templateId: "test-template",
      recipientMemberId: ownerMember.id,
      subscriptionStatus: "reject",
    },
  }),
});

assert(reminderResponse.data.id, "reminder id missing");
assert(reminderResponse.data.planId, "reminder should be linked to a reminder plan");
assert(reminderResponse.data.occurrenceNumber === 1, "first reminder occurrence number mismatch");
assert(reminderResponse.data.occurrenceStatus === "pending", "new reminder occurrence should be pending");
assert(reminderResponse.data.completedAt === undefined, "new reminder should not be completed");
assert(reminderResponse.data.notification?.sendStatus === "skipped", "rejected reminder notification should be skipped");
assert(reminderResponse.data.targetScope === "member", "reminder target scope missing");
assert(reminderResponse.data.targetMemberIds?.[0] === ownerMember.id, "reminder target member missing");
assert(reminderResponse.data.frequency === "daily_twice", "reminder frequency missing");
assert(reminderResponse.data.schedule?.frequencyLabel === "每天两次", "reminder schedule label missing");

const remindersResponse = await request(`/v1/families/${family.id}/reminders`);
assert(remindersResponse.data.some((reminder) => reminder.id === reminderResponse.data.id), "reminder list missing new reminder");

const completeReminderResponse = await request(`/v1/reminders/${reminderResponse.data.id}/complete`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    actorMemberId: ownerMember.id,
  }),
});

assert(completeReminderResponse.data.completedAt, "completed reminder missing completedAt");
assert(completeReminderResponse.data.completedByMemberId === ownerMember.id, "completed reminder member missing");
assert(completeReminderResponse.data.occurrenceStatus === "completed", "completed reminder occurrence status mismatch");

const remindersAfterCompleteResponse = await request(`/v1/families/${family.id}/reminders`);
const reminderPlanOccurrences = remindersAfterCompleteResponse.data.filter(
  (reminder) => reminder.planId === reminderResponse.data.planId,
);
const nextReminderOccurrence = reminderPlanOccurrences.find((reminder) => reminder.id !== reminderResponse.data.id);

assert(reminderPlanOccurrences.length === 2, "recurring reminder should create exactly one next occurrence");
assert(nextReminderOccurrence, "recurring reminder next occurrence missing");
assert(!nextReminderOccurrence.completedAt, "next reminder occurrence should be pending");
assert(nextReminderOccurrence.occurrenceNumber === 2, "next reminder occurrence number mismatch");
assert(nextReminderOccurrence.notification?.sendStatus === "skipped", "next reminder notification should require reauthorization");
assert(
  Date.parse(nextReminderOccurrence.dueAt) > Date.parse(reminderResponse.data.dueAt),
  "next reminder occurrence should move dueAt forward",
);

await request(`/v1/reminders/${reminderResponse.data.id}/complete`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    actorMemberId: ownerMember.id,
  }),
});

const remindersAfterRepeatedCompleteResponse = await request(`/v1/families/${family.id}/reminders`);
assert(
  remindersAfterRepeatedCompleteResponse.data.filter((reminder) => reminder.planId === reminderResponse.data.planId)
    .length === 2,
  "repeated reminder completion should not duplicate the next occurrence",
);

const oneTimeReminderResponse = await request(`/v1/families/${family.id}/reminders`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    type: "medicine",
    title: "一次性提醒",
    dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    createdByMemberId: ownerMember.id,
    assigneeMemberId: ownerMember.id,
    targetScope: "member",
    targetMemberIds: [ownerMember.id],
    frequency: "once",
  }),
});

await request(`/v1/reminders/${oneTimeReminderResponse.data.id}/complete`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    actorMemberId: ownerMember.id,
  }),
});

const remindersAfterOneTimeCompleteResponse = await request(`/v1/families/${family.id}/reminders`);
assert(
  remindersAfterOneTimeCompleteResponse.data.filter((reminder) => reminder.planId === oneTimeReminderResponse.data.planId)
    .length === 1,
  "one-time reminder completion should not create another occurrence",
);

const birthdayAdvanceDueAt = "2026-12-30T00:00:00.000Z";
const birthdayAdvanceReminderResponse = await request(`/v1/families/${family.id}/reminders`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    type: "birthday",
    title: "生日提前提醒",
    dueAt: birthdayAdvanceDueAt,
    createdByMemberId: ownerMember.id,
    assigneeMemberId: ownerMember.id,
    targetScope: "member",
    targetMemberIds: [ownerMember.id],
    frequency: "yearly",
    schedule: {
      targetLabel: "验收人",
      frequencyLabel: "提前 3 天",
      birthdayDate: "2027-01-02",
      advanceDays: 3,
      notifyOnDay: true,
    },
  }),
});

await request(`/v1/reminders/${birthdayAdvanceReminderResponse.data.id}/complete`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    actorMemberId: ownerMember.id,
  }),
});

const birthdayDayDueAt = "2027-01-02T00:00:00.000Z";
const birthdayDayReminderResponse = await request(`/v1/families/${family.id}/reminders`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    type: "birthday",
    title: "生日当天提醒",
    dueAt: birthdayDayDueAt,
    createdByMemberId: ownerMember.id,
    assigneeMemberId: ownerMember.id,
    targetScope: "member",
    targetMemberIds: [ownerMember.id],
    frequency: "yearly",
    schedule: {
      targetLabel: "验收人",
      frequencyLabel: "当天推送",
      birthdayDate: "2027-01-02",
      advanceDays: 0,
      notifyOnDay: true,
    },
  }),
});

await request(`/v1/reminders/${birthdayDayReminderResponse.data.id}/complete`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    actorMemberId: ownerMember.id,
  }),
});

const exerciseDueAt = "2026-12-31T23:30:00.000Z";
const exerciseReminderResponse = await request(`/v1/families/${family.id}/reminders`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    type: "exercise",
    title: "跨日运动",
    dueAt: exerciseDueAt,
    createdByMemberId: ownerMember.id,
    assigneeMemberId: ownerMember.id,
    targetScope: "family",
    targetMemberIds: [ownerMember.id, acceptResponse.data.member.id],
    frequency: "weekly",
    schedule: {
      targetLabel: "全家",
      frequencyLabel: "每周一次",
      timesOfDay: ["23:30"],
    },
  }),
});

await request(`/v1/reminders/${exerciseReminderResponse.data.id}/complete`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    actorMemberId: ownerMember.id,
  }),
});

const remindersAfterBoundaryFlowsResponse = await request(`/v1/families/${family.id}/reminders`);
const nextBirthdayAdvanceReminder = remindersAfterBoundaryFlowsResponse.data.find(
  (reminder) => reminder.planId === birthdayAdvanceReminderResponse.data.planId && reminder.id !== birthdayAdvanceReminderResponse.data.id,
);
const nextBirthdayDayReminder = remindersAfterBoundaryFlowsResponse.data.find(
  (reminder) => reminder.planId === birthdayDayReminderResponse.data.planId && reminder.id !== birthdayDayReminderResponse.data.id,
);
const nextExerciseReminder = remindersAfterBoundaryFlowsResponse.data.find(
  (reminder) => reminder.planId === exerciseReminderResponse.data.planId && reminder.id !== exerciseReminderResponse.data.id,
);

assert(nextBirthdayAdvanceReminder, "birthday advance-day next occurrence missing");
assert(nextBirthdayDayReminder, "birthday day-of next occurrence missing");
assert(nextExerciseReminder, "weekly exercise next occurrence missing");
assertNextYearSameUtcDay(
  birthdayAdvanceDueAt,
  nextBirthdayAdvanceReminder.dueAt,
  "birthday advance-day occurrence should advance one year",
);
assertNextYearSameUtcDay(
  birthdayDayDueAt,
  nextBirthdayDayReminder.dueAt,
  "birthday day-of occurrence should advance one year",
);
assertDaysApart(exerciseDueAt, nextExerciseReminder.dueAt, 7, "weekly exercise occurrence should advance seven days");

await assertFailure(
  `/v1/reminders/${reminderResponse.data.id}/complete`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      actorMemberId: otherFamilyResponse.data.ownerMember.id,
    }),
  },
  403,
  "forbidden",
  "reminder completion should reject cross-family actors",
);

await assertFailure(
  `/v1/families/${family.id}/ledger-entries`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      type: "expense",
      category: "daily",
      title: "越权付款人",
      amountCents: 2000,
      paidByMemberId: otherFamilyResponse.data.ownerMember.id,
      occurredAt: new Date().toISOString(),
    }),
  },
  403,
  "forbidden",
  "ledger entry creation should reject cross-family payers",
);

await assertFailure(
  `/v1/families/${family.id}/ledger-entries`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      type: "expense",
      category: "daily",
      title: "错误日期",
      amountCents: 2000,
      paidByMemberId: ownerMember.id,
      occurredAt: "not-a-date",
    }),
  },
  400,
  "invalid_occurred_at",
  "ledger entry creation should reject invalid dates",
);

await assertFailure(
  `/v1/families/${family.id}/ledger-entries`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      type: "expense",
      category: "daily",
      title: "越权分摊",
      amountCents: 2000,
      paidByMemberId: ownerMember.id,
      splitMemberIds: [otherFamilyResponse.data.ownerMember.id],
      occurredAt: new Date().toISOString(),
    }),
  },
  400,
  "invalid_split_member",
  "ledger entry creation should reject cross-family split members",
);

await assertFailure(
  `/v1/families/${family.id}/ledger-entries`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      type: "income",
      category: "subscription",
      title: "错误续费",
      amountCents: 2000,
      paidByMemberId: ownerMember.id,
      recurrence: "monthly",
      occurredAt: new Date().toISOString(),
    }),
  },
  400,
  "invalid_ledger_recurrence",
  "ledger recurring reminders should require expense entries",
);

const ledgerEntryResponse = await request(`/v1/families/${family.id}/ledger-entries`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    type: "expense",
    category: "daily",
    title: "家庭日常支出",
    amountCents: 2000,
    paidByMemberId: ownerMember.id,
    splitMemberIds: [ownerMember.id, acceptResponse.data.member.id],
    occurredAt: new Date().toISOString(),
  }),
});

assert(ledgerEntryResponse.data.id, "ledger entry id missing");
assert(ledgerEntryResponse.data.amountCents === 2000, "ledger entry amount mismatch");
assert(
  ledgerEntryResponse.data.splitMemberIds.includes(acceptResponse.data.member.id),
  "ledger entry should include selected split member",
);

const subscriptionLedgerResponse = await request(`/v1/families/${family.id}/ledger-entries`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    type: "expense",
    category: "subscription",
    title: "家庭会员",
    amountCents: 1200,
    paidByMemberId: ownerMember.id,
    splitMemberIds: [ownerMember.id, acceptResponse.data.member.id],
    recurrence: "monthly",
    occurredAt: new Date().toISOString(),
  }),
});

assert(subscriptionLedgerResponse.data.recurrence === "monthly", "subscription ledger recurrence missing");
assert(subscriptionLedgerResponse.data.recurringReminderId, "subscription ledger recurring reminder id missing");

const remindersAfterLedgerResponse = await request(`/v1/families/${family.id}/reminders`);
const recurringBillReminder = remindersAfterLedgerResponse.data.find(
  (reminder) => reminder.id === subscriptionLedgerResponse.data.recurringReminderId,
);
assert(recurringBillReminder?.type === "bill", "recurring subscription should create a bill reminder");
assert(recurringBillReminder?.frequency === "monthly", "recurring bill reminder should be monthly");

const ledgerGoalResponse = await request(`/v1/families/${family.id}/ledger-goal-funds`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    title: "家庭旅行基金",
    targetAmountCents: 100000,
    currentAmountCents: 25000,
    createdByMemberId: ownerMember.id,
    dueAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  }),
});

assert(ledgerGoalResponse.data.id, "ledger goal fund id missing");
assert(ledgerGoalResponse.data.currentAmountCents === 25000, "ledger goal current amount mismatch");

const ledgerMonth = new Date().toISOString().slice(0, 7);
const ledgerSummaryResponse = await request(`/v1/families/${family.id}/ledger-summary?month=${ledgerMonth}`);
assert(ledgerSummaryResponse.data.month === ledgerMonth, "ledger summary month mismatch");
assert(ledgerSummaryResponse.data.expenseCents >= 3200, "ledger summary expense total missing entries");
assert(
  ledgerSummaryResponse.data.categoryTotals.some(
    (item) => item.category === "subscription" && item.amountCents >= 1200,
  ),
  "ledger summary missing subscription category total",
);
assert(
  ledgerSummaryResponse.data.memberSplits.some(
    (item) => item.memberId === acceptResponse.data.member.id && item.owedCents >= 1600,
  ),
  "ledger summary missing joined member split",
);
assert(
  ledgerSummaryResponse.data.goalFunds.some((goal) => goal.id === ledgerGoalResponse.data.id),
  "ledger summary missing goal fund",
);

const ledgerEntriesResponse = await request(`/v1/families/${family.id}/ledger-entries`);
assert(
  ledgerEntriesResponse.data.some((entry) => entry.id === ledgerEntryResponse.data.id),
  "ledger list missing new entry",
);

await assertFailure(
  `/v1/families/${family.id}/digital-space-items`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      kind: "memory",
      title: "越权记忆",
      createdByMemberId: otherFamilyResponse.data.ownerMember.id,
    }),
  },
  403,
  "forbidden",
  "digital space item creation should reject cross-family creators",
);

await assertFailure(
  `/v1/families/${family.id}/digital-space-items`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      kind: "memory",
      title: "错误日期",
      createdByMemberId: ownerMember.id,
      occurredAt: "not-a-date",
    }),
  },
  400,
  "invalid_occurred_at",
  "digital space item creation should reject invalid dates",
);

await assertFailure(
  `/v1/families/${family.id}/digital-space-items`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      kind: "memory",
      title: "越权人物标签",
      createdByMemberId: ownerMember.id,
      taggedMemberIds: [otherFamilyResponse.data.ownerMember.id],
    }),
  },
  400,
  "invalid_tagged_member",
  "digital space item creation should reject cross-family people tags",
);

await assertFailure(
  `/v1/families/${family.id}/digital-space-items`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      kind: "memory",
      title: "错误媒体类型",
      createdByMemberId: ownerMember.id,
      mediaItems: [{ kind: "audio", label: "语音" }],
    }),
  },
  400,
  "invalid_media_item",
  "digital space item creation should reject unsupported media metadata",
);

const accountItemResponse = await request(`/v1/families/${family.id}/digital-space-items`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    kind: "account",
    title: "视频会员账号说明",
    summary: "只记录绑定手机号和归属人，不保存密码",
    createdByMemberId: ownerMember.id,
  }),
});

assert(accountItemResponse.data.securityWarning?.includes("不要保存密码"), "account item should expose safety warning");

const documentItemResponse = await request(`/v1/families/${family.id}/digital-space-items`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    kind: "document",
    title: "体检报告索引",
    summary: "报告还在网盘，这里先放元数据",
    url: "https://example.com/report.pdf",
    createdByMemberId: ownerMember.id,
    mediaItems: [{ kind: "file", label: "体检报告 PDF", url: "https://example.com/report.pdf", mimeType: "application/pdf" }],
  }),
});

assert(documentItemResponse.data.mediaItems?.[0]?.kind === "file", "document item should keep media metadata");

const digitalSpaceItemResponse = await request(`/v1/families/${family.id}/digital-space-items`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    kind: "memory",
    title: "一次家庭出行",
    summary: "周末一起出门散步的记忆",
    url: "https://example.com/family-memory",
    createdByMemberId: ownerMember.id,
    occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    place: "上海",
    taggedMemberIds: [ownerMember.id, acceptResponse.data.member.id],
    mediaItems: [{ kind: "image", label: "散步合照", url: "https://example.com/family-memory.jpg" }],
  }),
});

assert(digitalSpaceItemResponse.data.id, "digital space item id missing");
assert(digitalSpaceItemResponse.data.kind === "memory", "digital space item kind mismatch");
assert(digitalSpaceItemResponse.data.place === "上海", "memory item should keep place metadata");
assert(digitalSpaceItemResponse.data.taggedMemberIds?.length === 2, "memory item should keep people tags");
assert(digitalSpaceItemResponse.data.mediaItems?.[0]?.kind === "image", "memory item should keep media metadata");

const digitalSpaceItemsResponse = await request(`/v1/families/${family.id}/digital-space-items`);
assert(
  digitalSpaceItemsResponse.data.some((item) => item.id === digitalSpaceItemResponse.data.id),
  "digital space list missing new item",
);
const memoryItemsResponse = await request(`/v1/families/${family.id}/digital-space-items?kind=memory`);
assert(memoryItemsResponse.data.every((item) => item.kind === "memory"), "memory filter should only return memories");
const accountItemsResponse = await request(`/v1/families/${family.id}/digital-space-items?kind=account`);
assert(accountItemsResponse.data.some((item) => item.securityWarning), "account filter should include safety warnings");

await assertFailure(
  `/v1/families/${family.id}/activities`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      title: "错误日期活动",
      startsAt: "not-a-date",
      createdByMemberId: ownerMember.id,
    }),
  },
  400,
  "invalid_starts_at",
  "activity creation should reject invalid startsAt",
);

await assertFailure(
  `/v1/families/${family.id}/activities`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      title: "越权活动",
      startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdByMemberId: otherFamilyResponse.data.ownerMember.id,
    }),
  },
  403,
  "forbidden",
  "activity creation should reject cross-family creators",
);

const activityResponse = await request(`/v1/families/${family.id}/activities`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    title: "周末家庭聚会",
    startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    location: "家里",
    description: "一起吃饭、聊天、看看近况",
    createdByMemberId: ownerMember.id,
    participantMemberIds: [ownerMember.id, acceptResponse.data.member.id],
    tasks: [
      {
        title: "准备水果",
        assigneeMemberId: acceptResponse.data.member.id,
      },
    ],
  }),
});

assert(activityResponse.data.id, "activity id missing");
assert(activityResponse.data.status === "scheduled", "activity should be scheduled");
assert(activityResponse.data.participants?.length === 2, "activity should include participants");
assert(
  activityResponse.data.participants?.some(
    (participant) => participant.memberId === ownerMember.id && participant.rsvp === "accepted",
  ),
  "activity creator should be accepted",
);
assert(
  activityResponse.data.participants?.some(
    (participant) => participant.memberId === acceptResponse.data.member.id && participant.rsvp === "pending",
  ),
  "invited activity participant should start pending",
);
assert(activityResponse.data.tasks?.[0]?.title === "准备水果", "activity should include initial task");
assert(activityResponse.data.sharePath?.includes(activityResponse.data.id), "activity share path should include activity id");
assert(activityResponse.data.shareText?.includes("已安排"), "scheduled activity share text should include status");

await assertFailure(
  `/v1/families/${family.id}/activities`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      title: "越权参与人",
      startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdByMemberId: ownerMember.id,
      participantMemberIds: [otherFamilyResponse.data.ownerMember.id],
    }),
  },
  400,
  "invalid_activity_participant",
  "activity creation should reject cross-family participants",
);

const activityDetailResponse = await request(`/v1/families/${family.id}/activities/${activityResponse.data.id}`);
assert(activityDetailResponse.data.id === activityResponse.data.id, "activity detail should return requested activity");

const activityRsvpResponse = await request(`/v1/families/${family.id}/activities/${activityResponse.data.id}/rsvp`, {
  method: "POST",
  headers: joinAuthHeaders,
  body: JSON.stringify({
    actorMemberId: acceptResponse.data.member.id,
    memberId: acceptResponse.data.member.id,
    rsvp: "accepted",
  }),
});

assert(
  activityRsvpResponse.data.participants?.some(
    (participant) => participant.memberId === acceptResponse.data.member.id && participant.rsvp === "accepted",
  ),
  "activity RSVP should update participant state",
);

await assertFailure(
  `/v1/families/${family.id}/activities/${activityResponse.data.id}/rsvp`,
  {
    method: "POST",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      actorMemberId: ownerMember.id,
      memberId: acceptResponse.data.member.id,
      rsvp: "declined",
    }),
  },
  403,
  "forbidden",
  "activity RSVP should not allow one member to impersonate another",
);

const activityTaskResponse = await request(`/v1/families/${family.id}/activities/${activityResponse.data.id}/tasks`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    actorMemberId: ownerMember.id,
    title: "订家庭视频会议",
    assigneeMemberId: ownerMember.id,
  }),
});

assert(activityTaskResponse.data.tasks?.length === 2, "activity task creation should append a task");

const joinedTask = activityTaskResponse.data.tasks?.find((task) => task.assigneeMemberId === acceptResponse.data.member.id);
assert(joinedTask?.id, "initial assigned activity task missing");

const completedTaskResponse = await request(
  `/v1/families/${family.id}/activities/${activityResponse.data.id}/tasks/${joinedTask.id}`,
  {
    method: "PUT",
    headers: joinAuthHeaders,
    body: JSON.stringify({
      actorMemberId: acceptResponse.data.member.id,
      status: "done",
    }),
  },
);

assert(
  completedTaskResponse.data.tasks?.some((task) => task.id === joinedTask.id && task.status === "done"),
  "activity task assignee should be able to complete task",
);

await assertFailure(
  `/v1/families/${family.id}/activities/${activityResponse.data.id}/status`,
  {
    method: "PUT",
    headers: joinAuthHeaders,
    body: JSON.stringify({
      actorMemberId: acceptResponse.data.member.id,
      status: "completed",
    }),
  },
  403,
  "forbidden",
  "non-admin non-creator should not complete the activity",
);

const completedActivityResponse = await request(`/v1/families/${family.id}/activities/${activityResponse.data.id}/status`, {
  method: "PUT",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    actorMemberId: ownerMember.id,
    status: "completed",
  }),
});

assert(completedActivityResponse.data.status === "completed", "activity should complete");
assert(completedActivityResponse.data.completedAt, "completed activity should include completedAt");
assert(completedActivityResponse.data.memoryItemId, "completed activity should create a memory item");
assert(completedActivityResponse.data.shareText?.includes("已完成"), "completed activity share text should include status");

const digitalSpaceAfterActivityResponse = await request(`/v1/families/${family.id}/digital-space-items`);
assert(
  digitalSpaceAfterActivityResponse.data.some(
    (item) => item.id === completedActivityResponse.data.memoryItemId && item.activityId === activityResponse.data.id,
  ),
  "completed activity memory item should link back to the activity",
);

const cancellableActivityResponse = await request(`/v1/families/${family.id}/activities`, {
  method: "POST",
  headers: ownerAuthHeaders,
  body: JSON.stringify({
    title: "可取消活动",
    startsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    createdByMemberId: ownerMember.id,
    participantMemberIds: [ownerMember.id],
  }),
});

const cancelledActivityResponse = await request(
  `/v1/families/${family.id}/activities/${cancellableActivityResponse.data.id}/status`,
  {
    method: "PUT",
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      actorMemberId: ownerMember.id,
      status: "cancelled",
    }),
  },
);

assert(cancelledActivityResponse.data.status === "cancelled", "activity should cancel");
assert(cancelledActivityResponse.data.cancelledAt, "cancelled activity should include cancelledAt");
assert(cancelledActivityResponse.data.shareText?.includes("已取消"), "cancelled activity share text should include status");

const activitiesResponse = await request(`/v1/families/${family.id}/activities`);
assert(activitiesResponse.data.some((activity) => activity.id === activityResponse.data.id), "activity list missing new item");

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
      activityId: activityResponse.data.id,
    },
    null,
    2,
  ),
);
