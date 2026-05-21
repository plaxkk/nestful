import type { FastifyInstance } from "fastify";
import type { FamilyRole, ReminderType } from "@family-housekeeper/shared";
import { familyStore } from "./store.js";
import { canAddMemberDirectly, canCreateInvitation, isFamilyMember, redactMemberForList } from "./privacy.js";

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

export async function registerRoutes(server: FastifyInstance) {
  server.get("/health", async () => ({
    ok: true,
    service: "family-housekeeper-api",
  }));

  server.get("/v1/families", async () => ({
    data: familyStore.listFamilies(),
  }));

  server.post("/v1/families", async (request, reply) => {
    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const name = requiredString(request.body, "name");
    const ownerUserId = requiredString(request.body, "ownerUserId");
    const ownerDisplayName = requiredString(request.body, "ownerDisplayName");

    if (!name || !ownerUserId || !ownerDisplayName) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    const data = familyStore.createFamily({ name, ownerUserId, ownerDisplayName });

    return reply.code(201).send({ data });
  });

  server.get("/v1/families/:familyId", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const family = familyStore.getFamily(familyId);

    if (!family) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return { data: family };
  });

  server.get("/v1/families/:familyId/members", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!familyStore.getFamily(familyId)) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: familyStore.listMembers(familyId).map(redactMemberForList),
    };
  });

  server.post("/v1/families/:familyId/members", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!familyStore.getFamily(familyId)) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const actorMember = createdByMemberId ? familyStore.getMember(createdByMemberId) : undefined;

    if (!canAddMemberDirectly(actorMember, familyId)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const displayName = requiredString(request.body, "displayName");

    if (!displayName) {
      return reply.code(400).send({ error: "missing_required_fields" });
    }

    const member = familyStore.createMember(
      familyId,
      {
        displayName,
        role: optionalRole(request.body, "role"),
        userId: optionalString(request.body, "userId"),
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

    if (!familyStore.getFamily(familyId)) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const createdByMemberId = requiredString(request.body, "createdByMemberId");

    const actorMember = createdByMemberId ? familyStore.getMember(createdByMemberId) : undefined;

    if (!createdByMemberId || !canCreateInvitation(actorMember, familyId)) {
      return reply.code(400).send({ error: "invalid_creator_member" });
    }

    const invitation = familyStore.createInvitation(familyId, {
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
    const invitation = familyStore.getInvitationByCode(code);

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

    const result = familyStore.acceptInvitation(code, {
      displayName,
      userId: optionalString(request.body, "userId"),
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

    if (!familyStore.getFamily(familyId)) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: familyStore.listReminders(familyId),
    };
  });

  server.post("/v1/families/:familyId/reminders", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!familyStore.getFamily(familyId)) {
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
    const creator = createdByMemberId ? familyStore.getMember(createdByMemberId) : undefined;
    const assignee = assigneeMemberId ? familyStore.getMember(assigneeMemberId) : undefined;

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

    const reminder = familyStore.createReminder(familyId, {
      type,
      title,
      dueAt,
      createdByMemberId,
      assigneeMemberId,
    });

    return reply.code(201).send({ data: reminder });
  });

  server.post("/v1/reminders/:reminderId/complete", async (request, reply) => {
    const { reminderId } = request.params as { reminderId: string };
    const reminder = familyStore.getReminder(reminderId);

    if (!reminder) {
      return reply.code(404).send({ error: "reminder_not_found" });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ error: "body_required" });
    }

    const actorMemberId = requiredString(request.body, "actorMemberId");
    const actor = actorMemberId ? familyStore.getMember(actorMemberId) : undefined;

    if (!actorMemberId || !isFamilyMember(actor, reminder.familyId)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return reply.code(200).send({
      data: familyStore.completeReminder(reminderId, actorMemberId),
    });
  });

  server.get("/v1/families/:familyId/activities", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!familyStore.getFamily(familyId)) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: familyStore.listActivities(familyId),
    };
  });

  server.get("/v1/families/:familyId/audit-events", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!familyStore.getFamily(familyId)) {
      return reply.code(404).send({ error: "family_not_found" });
    }

    return {
      data: familyStore.listAuditEvents(familyId),
    };
  });
}
