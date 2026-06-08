import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  DigitalSpaceItemKind,
  FamilyRole,
  LedgerCategory,
  LedgerEntryType,
  ReminderNotification,
  ReminderType,
} from "@nestful/shared";
import { familyStore } from "./store.js";
import { canAddMemberDirectly, canCreateInvitation, isFamilyMember, redactMemberForList } from "./privacy.js";
import {
  exchangeWechatCode,
  getReminderSubscriptionConfig,
  sendReminderSubscriptionMessage,
} from "./wechat.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (body: Record<string, unknown>, key: string) => {
  const value = body[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

const optionalString = (body: Record<string, unknown>, key: string) => {
  const value = body[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

const optionalRole = (body: Record<string, unknown>, key: string): FamilyRole | undefined => {
  const value = body[key];
  const roles: FamilyRole[] = ["admin", "member", "elder", "child", "guest"];

  return typeof value === "string" && roles.includes(value as FamilyRole) ? (value as FamilyRole) : undefined;
};

const optionalReminderType = (body: Record<string, unknown>, key: string): ReminderType | undefined => {
  const value = body[key];
  const types: ReminderType[] = ["birthday", "medicine", "exercise"];

  return typeof value === "string" && types.includes(value as ReminderType) ? (value as ReminderType) : undefined;
};

const optionalLedgerEntryType = (body: Record<string, unknown>, key: string): LedgerEntryType | undefined => {
  const value = body[key];
  const types: LedgerEntryType[] = ["expense", "income"];

  return typeof value === "string" && types.includes(value as LedgerEntryType) ? (value as LedgerEntryType) : undefined;
};

const optionalLedgerCategory = (body: Record<string, unknown>, key: string): LedgerCategory | undefined => {
  const value = body[key];
  const categories: LedgerCategory[] = ["daily", "education", "health", "travel", "housing", "subscription", "other"];

  return typeof value === "string" && categories.includes(value as LedgerCategory) ? (value as LedgerCategory) : undefined;
};

const optionalDigitalSpaceKind = (body: Record<string, unknown>, key: string): DigitalSpaceItemKind | undefined => {
  const value = body[key];
  const kinds: DigitalSpaceItemKind[] = ["document", "account", "memory"];

  return typeof value === "string" && kinds.includes(value as DigitalSpaceItemKind)
    ? (value as DigitalSpaceItemKind)
    : undefined;
};

const optionalReminderNotificationStatus = (
  body: Record<string, unknown>,
  key: string,
): ReminderNotification["subscriptionStatus"] | undefined => {
  const value = body[key];
  const statuses: Array<ReminderNotification["subscriptionStatus"]> = ["accept", "reject", "ban", "filter", "unavailable"];

  return typeof value === "string" && statuses.includes(value as ReminderNotification["subscriptionStatus"])
    ? (value as ReminderNotification["subscriptionStatus"])
    : undefined;
};

const optionalPositiveInteger = (body: Record<string, unknown>, key: string) => {
  const value = body[key];

  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
};

export async function registerRoutes(server: FastifyInstance) {
  server.get("/health", async () => ({
    ok: true,
    service: "nestful-api",
  }));

  server.get("/v1/families", async () => ({
    data: await familyStore.listFamilies(),
  }));

  server.post("/v1/families", async (request, reply) => {
    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const name = requiredString(request.body, "name");
    const ownerUserId = requiredString(request.body, "ownerUserId");
    const ownerDisplayName = requiredString(request.body, "ownerDisplayName");
    const ownerWechatOpenId = optionalString(request.body, "ownerWechatOpenId");

    if (!name || !ownerUserId || !ownerDisplayName) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    const data = await familyStore.createFamily({ name, ownerUserId, ownerDisplayName, ownerWechatOpenId });

    return reply.code(201).send({ data });
  });

  server.get("/v1/families/:familyId", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const family = await familyStore.getFamily(familyId);

    if (!family) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return { data: family };
  });

  server.get("/v1/families/:familyId/members", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: (await familyStore.listMembers(familyId)).map(redactMemberForList),
    };
  });

  server.post("/v1/families/:familyId/members", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const actorMember = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;

    if (!canAddMemberDirectly(actorMember, familyId)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const displayName = requiredString(request.body, "displayName");

    if (!displayName) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    const member = await familyStore.createMember(
      familyId,
      {
        displayName,
        role: optionalRole(request.body, "role"),
        userId: optionalString(request.body, "userId"),
        wechatOpenId: optionalString(request.body, "wechatOpenId"),
        birthday: optionalString(request.body, "birthday"),
        birthdayCalendar: optionalString(request.body, "birthdayCalendar") as "solar" | "lunar" | undefined,
        location: optionalString(request.body, "location"),
        emergencyContact: optionalString(request.body, "emergencyContact"),
      },
      createdByMemberId,
    );

    return reply.code(201).send({ data: redactMemberForList(member) });
  });

  server.post("/v1/families/:familyId/invitations", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const createdByMemberId = requiredString(request.body, "createdByMemberId");

    const actorMember = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;

    if (!createdByMemberId || !canCreateInvitation(actorMember, familyId)) {
      return reply.code(400).send({ error: "invalid_creator_member" });
    }

    const invitation = await familyStore.createInvitation(familyId, {
      createdByMemberId,
      role: optionalRole(request.body, "role"),
      expiresAt: optionalString(request.body, "expiresAt"),
    });

    return reply.code(201).send({
      data: {
        invitation,
        joinPath: `/pages/join/index?code=${invitation.code}`,
      },
    });
  });

  server.get("/v1/invitations/:code", async (request, reply) => {
    const { code } = request.params as { code: string };
    const invitation = await familyStore.getInvitationByCode(code);

    if (!invitation) {
      return reply.code(404).send({ error: "invitation_not_found" });
    }

    return {
      data: {
        id: invitation.id,
        familyId: invitation.familyId,
        code: invitation.code,
        role: invitation.role,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
      },
    };
  });

  server.post("/v1/invitations/:code/accept", async (request, reply) => {
    const { code } = request.params as { code: string };

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const displayName = requiredString(request.body, "displayName");

    if (!displayName) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    const result = await familyStore.acceptInvitation(code, {
      displayName,
      userId: optionalString(request.body, "userId"),
      wechatOpenId: optionalString(request.body, "wechatOpenId"),
      birthday: optionalString(request.body, "birthday"),
      birthdayCalendar: optionalString(request.body, "birthdayCalendar") as "solar" | "lunar" | undefined,
      location: optionalString(request.body, "location"),
      emergencyContact: optionalString(request.body, "emergencyContact"),
    });

    if (!result) {
      return reply.code(404).send({ error: "invitation_unavailable" });
    }

    return reply.code(201).send({
      data: {
        invitation: result.invitation,
        member: redactMemberForList(result.member),
      },
    });
  });

  server.get("/v1/families/:familyId/reminders", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: await familyStore.listReminders(familyId),
    };
  });

  server.get("/v1/reminders/subscription-config", async () => ({
    data: getReminderSubscriptionConfig(),
  }));

  server.post("/v1/families/:familyId/reminders", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const type = optionalReminderType(request.body, "type");
    const title = requiredString(request.body, "title");
    const dueAt = requiredString(request.body, "dueAt");
    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const assigneeMemberId = optionalString(request.body, "assigneeMemberId");
    const notificationSubscription = isObject(request.body.notificationSubscription)
      ? {
          templateId: requiredString(request.body.notificationSubscription, "templateId"),
          recipientMemberId: requiredString(request.body.notificationSubscription, "recipientMemberId"),
          subscriptionStatus: optionalReminderNotificationStatus(
            request.body.notificationSubscription,
            "subscriptionStatus",
          ),
        }
      : undefined;
    const creator = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;
    const assignee = assigneeMemberId ? await familyStore.getMember(assigneeMemberId) : undefined;

    if (!type || !title || !dueAt || !createdByMemberId) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    if (Number.isNaN(Date.parse(dueAt))) {
      return reply.code(400).send({ error: "invalid_due_at" });
    }

    if (!isFamilyMember(creator, familyId)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    if (assigneeMemberId && !isFamilyMember(assignee, familyId)) {
      return reply.code(400).send({ error: "invalid_assignee_member" });
    }

    const reminder = await familyStore.createReminder(familyId, {
      type,
      title,
      dueAt,
      createdByMemberId,
      assigneeMemberId,
      notificationSubscription:
        notificationSubscription?.templateId &&
        notificationSubscription.recipientMemberId &&
        notificationSubscription.subscriptionStatus
          ? {
              templateId: notificationSubscription.templateId,
              recipientMemberId: notificationSubscription.recipientMemberId,
              subscriptionStatus: notificationSubscription.subscriptionStatus,
            }
          : undefined,
    });

    return reply.code(201).send({ data: reminder });
  });

  server.post("/v1/reminders/:reminderId/complete", async (request, reply) => {
    const { reminderId } = request.params as { reminderId: string };
    const reminder = await familyStore.getReminder(reminderId);

    if (!reminder) {
      return reply.code(404).send({ error: "reminder_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const actorMemberId = requiredString(request.body, "actorMemberId");
    const actor = actorMemberId ? await familyStore.getMember(actorMemberId) : undefined;

    if (!actorMemberId || !isFamilyMember(actor, reminder.familyId)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return reply.code(200).send({
      data: await familyStore.completeReminder(reminderId, actorMemberId),
    });
  });

  server.post("/v1/wechat/session", async (request, reply) => {
    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const code = requiredString(request.body, "code");

    if (!code) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    try {
      return {
        data: await exchangeWechatCode(code),
      };
    } catch (error) {
      request.log.error({ error }, "wechat session exchange failed");
      return reply.code(502).send({ error: "wechat_session_failed" });
    }
  });

  const dispatchDueReminders = async (request: FastifyRequest, reply: FastifyReply) => {
    const cronSecret = process.env.CRON_SECRET?.trim() || process.env.NESTFUL_CRON_SECRET?.trim();
    const query = isObject(request.query) ? request.query : {};
    const querySecret = typeof query.secret === "string" ? query.secret : undefined;
    const authHeader = request.headers.authorization;
    const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

    if (cronSecret && querySecret !== cronSecret && bearerSecret !== cronSecret) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    return {
      data: await familyStore.dispatchDueReminders(sendReminderSubscriptionMessage),
    };
  };

  server.get("/v1/reminders/dispatch-due", dispatchDueReminders);
  server.post("/v1/reminders/dispatch-due", dispatchDueReminders);

  server.get("/v1/families/:familyId/activities", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: await familyStore.listActivities(familyId),
    };
  });

  server.post("/v1/families/:familyId/activities", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const title = requiredString(request.body, "title");
    const startsAt = requiredString(request.body, "startsAt");
    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const location = optionalString(request.body, "location");
    const description = optionalString(request.body, "description");
    const creator = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;

    if (!title || !startsAt || !createdByMemberId) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    if (Number.isNaN(Date.parse(startsAt))) {
      return reply.code(400).send({ error: "invalid_starts_at" });
    }

    if (!isFamilyMember(creator, familyId)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return reply.code(201).send({
      data: await familyStore.createActivity(familyId, {
        title,
        startsAt,
        createdByMemberId,
        location,
        description,
      }),
    });
  });

  server.get("/v1/families/:familyId/ledger-entries", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: await familyStore.listLedgerEntries(familyId),
    };
  });

  server.post("/v1/families/:familyId/ledger-entries", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const type = optionalLedgerEntryType(request.body, "type");
    const category = optionalLedgerCategory(request.body, "category");
    const title = requiredString(request.body, "title");
    const amountCents = optionalPositiveInteger(request.body, "amountCents");
    const paidByMemberId = requiredString(request.body, "paidByMemberId");
    const occurredAt = requiredString(request.body, "occurredAt");
    const paidByMember = paidByMemberId ? await familyStore.getMember(paidByMemberId) : undefined;

    if (!type || !category || !title || !amountCents || !paidByMemberId || !occurredAt) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    if (Number.isNaN(Date.parse(occurredAt))) {
      return reply.code(400).send({ error: "invalid_occurred_at" });
    }

    if (!isFamilyMember(paidByMember, familyId)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return reply.code(201).send({
      data: await familyStore.createLedgerEntry(familyId, {
        type,
        category,
        title,
        amountCents,
        paidByMemberId,
        occurredAt,
      }),
    });
  });

  server.get("/v1/families/:familyId/digital-space-items", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: await familyStore.listDigitalSpaceItems(familyId),
    };
  });

  server.post("/v1/families/:familyId/digital-space-items", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const kind = optionalDigitalSpaceKind(request.body, "kind");
    const title = requiredString(request.body, "title");
    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const summary = optionalString(request.body, "summary");
    const url = optionalString(request.body, "url");
    const occurredAt = optionalString(request.body, "occurredAt");
    const creator = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;

    if (!kind || !title || !createdByMemberId) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    if (!isFamilyMember(creator, familyId)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    if (occurredAt && Number.isNaN(Date.parse(occurredAt))) {
      return reply.code(400).send({ error: "invalid_occurred_at" });
    }

    return reply.code(201).send({
      data: await familyStore.createDigitalSpaceItem(familyId, {
        kind,
        title,
        createdByMemberId,
        summary,
        url,
        occurredAt,
      }),
    });
  });

  server.get("/v1/families/:familyId/audit-events", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: await familyStore.listAuditEvents(familyId),
    };
  });
}
