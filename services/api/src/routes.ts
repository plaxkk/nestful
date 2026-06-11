import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { FamilyInvitation, FamilyMember, ReminderType, User } from "@nestful/shared";
import { familyStore } from "./store.js";
import {
  canAddMemberDirectly,
  canCreateInvitation,
  canManageFamily,
  isFamilyMember,
  redactMemberForList,
} from "./privacy.js";
import {
  isObject,
  optionalActivityStatus,
  optionalActivityTaskStatus,
  optionalBirthdayCalendar,
  optionalDigitalSpaceKind,
  optionalDigitalSpaceMediaKind,
  optionalLedgerCategory,
  optionalLedgerEntryType,
  optionalLedgerRecurrence,
  optionalPositiveInteger,
  optionalReminderFrequency,
  optionalReminderNotificationStatus,
  optionalReminderTargetScope,
  optionalReminderType,
  optionalRole,
  optionalRsvpStatus,
  optionalString,
  optionalStringArray,
  requiredString,
  sendApiError,
} from "./request.js";
import {
  exchangeWechatCode,
  getReminderSubscriptionConfig,
  sendReminderSubscriptionMessage,
} from "./wechat.js";

const bearerTokenFrom = (request: FastifyRequest) => {
  const authHeader = request.headers.authorization;

  return authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
};

const requireAuthenticatedUser = async (request: FastifyRequest, reply: FastifyReply) => {
  const auth = await familyStore.getUserSession(bearerTokenFrom(request));

  if (!auth?.user) {
    sendApiError(reply, 401, "unauthorized");
    return undefined;
  }

  return auth.user;
};

const canActAsMember = (member: FamilyMember | undefined, user: User) =>
  Boolean(member && (member.userId === user.id || (member.wechatOpenId && member.wechatOpenId === user.wechatOpenId)));

const memberForUser = async (familyId: string, user: User) => {
  const members = await familyStore.listMembers(familyId);

  return members.find((member) => canActAsMember(member, user));
};

const canViewSensitiveMember = (viewer: FamilyMember | undefined, member: FamilyMember | undefined) =>
  Boolean(viewer && member && (viewer.id === member.id || canManageFamily(viewer, member.familyId)));

const memberForViewer = (member: FamilyMember, viewer: FamilyMember | undefined) =>
  canViewSensitiveMember(viewer, member) ? member : redactMemberForList(member);

const canManageActivity = (
  actor: FamilyMember | undefined,
  activity: { familyId: string; createdByMemberId: string } | undefined,
) => Boolean(actor && activity && (actor.id === activity.createdByMemberId || canManageFamily(actor, activity.familyId)));

const invitationStatus = (invitation: FamilyInvitation) => {
  if (invitation.acceptedAt) {
    return "accepted";
  }

  if (invitation.canceledAt) {
    return "canceled";
  }

  if (invitation.expiresAt && Date.parse(invitation.expiresAt) < Date.now()) {
    return "expired";
  }

  return "active";
};

const invitationForList = (invitation: FamilyInvitation) => ({
  ...invitation,
  status: invitationStatus(invitation),
  joinPath: `/pages/join/index?code=${invitation.code}`,
});

const hasKey = (body: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(body, key);

export async function registerRoutes(server: FastifyInstance) {
  server.get("/health", async () => ({
    ok: true,
    service: "nestful-api",
  }));

  server.get("/v1/families", async () => ({
    data: await familyStore.listFamilies(),
  }));

  server.get("/v1/me/families", async (request, reply) => {
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    const memberships = await familyStore.listFamilyMembershipsForUser(authUser);

    return {
      data: await Promise.all(
        memberships.map(async ({ family, member }) => ({
          family,
          member: redactMemberForList(member),
          members: (await familyStore.listMembers(family.id)).map(redactMemberForList),
        })),
      ),
    };
  });

  server.post("/v1/families", async (request, reply) => {
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const name = requiredString(request.body, "name");
    const ownerUserId = requiredString(request.body, "ownerUserId");
    const ownerDisplayName = requiredString(request.body, "ownerDisplayName");
    const ownerWechatOpenId = optionalString(request.body, "ownerWechatOpenId");

    if (!name || !ownerUserId || !ownerDisplayName) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (ownerUserId !== authUser.id) {
      return sendApiError(reply, 403, "forbidden");
    }

    const data = await familyStore.createFamily({ name, ownerUserId, ownerDisplayName, ownerWechatOpenId });

    return reply.code(201).send({ data });
  });

  server.get("/v1/families/:familyId", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const family = await familyStore.getFamily(familyId);

    if (!family) {
      return sendApiError(reply, 404, "family_not_found");
    }

    return { data: family };
  });

  server.get("/v1/families/:familyId/members", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    return {
      data: (await familyStore.listMembers(familyId)).map(redactMemberForList),
    };
  });

  server.get("/v1/families/:familyId/members/:memberId", async (request, reply) => {
    const { familyId, memberId } = request.params as { familyId: string; memberId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    const viewer = await memberForUser(familyId, authUser);
    const member = await familyStore.getMember(memberId);

    if (!viewer) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(member, familyId)) {
      return sendApiError(reply, 404, "member_not_found");
    }

    return {
      data: memberForViewer(member, viewer),
    };
  });

  server.put("/v1/families/:familyId/members/:memberId", async (request, reply) => {
    const { familyId, memberId } = request.params as { familyId: string; memberId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const viewer = await memberForUser(familyId, authUser);
    const member = await familyStore.getMember(memberId);

    if (!viewer) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(member, familyId)) {
      return sendApiError(reply, 404, "member_not_found");
    }

    const changingRole = hasKey(request.body, "role");
    const nextRole = changingRole ? optionalRole(request.body, "role") : undefined;

    if (changingRole && !nextRole) {
      return sendApiError(reply, 400, "invalid_role");
    }

    if (hasKey(request.body, "birthdayCalendar") && request.body.birthdayCalendar !== undefined) {
      const nextBirthdayCalendar = optionalBirthdayCalendar(request.body, "birthdayCalendar");

      if (!nextBirthdayCalendar) {
        return sendApiError(reply, 400, "invalid_birthday_calendar");
      }
    }

    if (viewer.id !== member.id && !canManageFamily(viewer, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (changingRole && !canManageFamily(viewer, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    const members = await familyStore.listMembers(familyId);
    const adminCount = members.filter((item) => item.role === "admin").length;

    if (member.role === "admin" && nextRole && nextRole !== "admin" && adminCount <= 1) {
      return sendApiError(reply, 400, "last_admin_required");
    }

    const displayName = hasKey(request.body, "displayName") ? requiredString(request.body, "displayName") : undefined;

    if (hasKey(request.body, "displayName") && !displayName) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    const updated = await familyStore.updateMember(
      member.id,
      {
        ...(displayName ? { displayName } : {}),
        ...(nextRole ? { role: nextRole } : {}),
        ...(hasKey(request.body, "birthday") ? { birthday: optionalString(request.body, "birthday") } : {}),
        ...(hasKey(request.body, "birthdayCalendar")
          ? { birthdayCalendar: optionalBirthdayCalendar(request.body, "birthdayCalendar") }
          : {}),
        ...(hasKey(request.body, "location") ? { location: optionalString(request.body, "location") } : {}),
        ...(hasKey(request.body, "emergencyContact")
          ? { emergencyContact: optionalString(request.body, "emergencyContact") }
          : {}),
      },
      viewer.id,
    );

    return {
      data: memberForViewer(updated ?? member, viewer),
    };
  });

  server.delete("/v1/families/:familyId/members/:memberId", async (request, reply) => {
    const { familyId, memberId } = request.params as { familyId: string; memberId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    const viewer = await memberForUser(familyId, authUser);
    const member = await familyStore.getMember(memberId);

    if (!viewer || !canManageFamily(viewer, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(member, familyId)) {
      return sendApiError(reply, 404, "member_not_found");
    }

    const members = await familyStore.listMembers(familyId);
    const adminCount = members.filter((item) => item.role === "admin").length;

    if (member.role === "admin" && adminCount <= 1) {
      return sendApiError(reply, 400, "last_admin_required");
    }

    const removed = await familyStore.removeMember(member.id, viewer.id);

    return {
      data: removed ? redactMemberForList(removed) : undefined,
    };
  });

  server.post("/v1/families/:familyId/members", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const actorMember = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;

    if (!canActAsMember(actorMember, authUser)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!canAddMemberDirectly(actorMember, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    const displayName = requiredString(request.body, "displayName");

    if (!displayName) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    const member = await familyStore.createMember(
      familyId,
      {
        displayName,
        role: optionalRole(request.body, "role"),
        userId: optionalString(request.body, "userId"),
        wechatOpenId: optionalString(request.body, "wechatOpenId"),
        birthday: optionalString(request.body, "birthday"),
        birthdayCalendar: optionalBirthdayCalendar(request.body, "birthdayCalendar"),
        location: optionalString(request.body, "location"),
        emergencyContact: optionalString(request.body, "emergencyContact"),
      },
      createdByMemberId,
    );

    return reply.code(201).send({ data: redactMemberForList(member) });
  });

  server.post("/v1/families/:familyId/invitations", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const createdByMemberId = requiredString(request.body, "createdByMemberId");

    const actorMember = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;

    if (!createdByMemberId || !actorMember) {
      return sendApiError(reply, 400, "invalid_creator_member");
    }

    if (!canActAsMember(actorMember, authUser)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!canCreateInvitation(actorMember, familyId)) {
      return sendApiError(reply, 403, "forbidden");
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

  server.get("/v1/families/:familyId/invitations", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    const viewer = await memberForUser(familyId, authUser);

    if (!viewer || !canManageFamily(viewer, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    return {
      data: (await familyStore.listInvitations(familyId)).map(invitationForList),
    };
  });

  server.delete("/v1/families/:familyId/invitations/:invitationId", async (request, reply) => {
    const { familyId, invitationId } = request.params as { familyId: string; invitationId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    const viewer = await memberForUser(familyId, authUser);

    if (!viewer || !canManageFamily(viewer, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    const invitation = await familyStore.getInvitation(invitationId);

    if (!invitation || invitation.familyId !== familyId) {
      return sendApiError(reply, 404, "invitation_not_found");
    }

    if (invitation.acceptedAt) {
      return sendApiError(reply, 400, "invitation_already_accepted");
    }

    const canceled = await familyStore.cancelInvitation(invitation.id, viewer.id);

    return {
      data: canceled ? invitationForList(canceled) : undefined,
    };
  });

  server.get("/v1/invitations/:code", async (request, reply) => {
    const { code } = request.params as { code: string };
    const invitation = await familyStore.getInvitationByCode(code);

    if (!invitation) {
      return sendApiError(reply, 404, "invitation_not_found");
    }

    return {
      data: {
        id: invitation.id,
        familyId: invitation.familyId,
        code: invitation.code,
        role: invitation.role,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        canceledAt: invitation.canceledAt,
        acceptedAt: invitation.acceptedAt,
        status: invitationStatus(invitation),
      },
    };
  });

  server.post("/v1/invitations/:code/accept", async (request, reply) => {
    const { code } = request.params as { code: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const displayName = requiredString(request.body, "displayName");

    if (!displayName) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    const result = await familyStore.acceptInvitation(code, {
      displayName,
      userId: authUser.id,
      wechatOpenId: authUser.wechatOpenId,
      birthday: optionalString(request.body, "birthday"),
      birthdayCalendar: optionalBirthdayCalendar(request.body, "birthdayCalendar"),
      location: optionalString(request.body, "location"),
      emergencyContact: optionalString(request.body, "emergencyContact"),
    });

    if (!result) {
      return sendApiError(reply, 404, "invitation_unavailable");
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
      return sendApiError(reply, 404, "family_not_found");
    }

    return {
      data: await familyStore.listReminders(familyId),
    };
  });

  server.get("/v1/reminders/subscription-config", async () => ({
    data: getReminderSubscriptionConfig(),
  }));

  server.get("/v1/reminders/subscription-config/:type", async (request) => {
    const { type } = request.params as { type: ReminderType };

    return {
      data: getReminderSubscriptionConfig(type),
    };
  });

  server.post("/v1/families/:familyId/reminders", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const type = optionalReminderType(request.body, "type");
    const title = requiredString(request.body, "title");
    const dueAt = requiredString(request.body, "dueAt");
    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const assigneeMemberId = optionalString(request.body, "assigneeMemberId");
    const targetScope = optionalReminderTargetScope(request.body, "targetScope");
    const targetMemberIds = optionalStringArray(request.body, "targetMemberIds");
    const frequency = optionalReminderFrequency(request.body, "frequency");
    const schedule = isObject(request.body.schedule) ? request.body.schedule : undefined;
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
    const targetMembers = targetMemberIds ? await Promise.all(targetMemberIds.map((id) => familyStore.getMember(id))) : [];
    const notificationRecipient = notificationSubscription?.recipientMemberId
      ? await familyStore.getMember(notificationSubscription.recipientMemberId)
      : undefined;

    if (!type || !title || !dueAt || !createdByMemberId) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (
      notificationSubscription &&
      (!notificationSubscription.templateId ||
        !notificationSubscription.recipientMemberId ||
        !notificationSubscription.subscriptionStatus)
    ) {
      return sendApiError(reply, 400, "invalid_notification_subscription");
    }

    if (Number.isNaN(Date.parse(dueAt))) {
      return sendApiError(reply, 400, "invalid_due_at");
    }

    if (!canActAsMember(creator, authUser)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(creator, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (assigneeMemberId && !isFamilyMember(assignee, familyId)) {
      return sendApiError(reply, 400, "invalid_assignee_member");
    }

    if (targetMembers.some((member) => !isFamilyMember(member, familyId))) {
      return sendApiError(reply, 400, "invalid_target_member");
    }

    if (notificationSubscription && !isFamilyMember(notificationRecipient, familyId)) {
      return sendApiError(reply, 400, "invalid_notification_recipient");
    }

    if (
      notificationSubscription?.subscriptionStatus === "accept" &&
      !canActAsMember(notificationRecipient, authUser)
    ) {
      return sendApiError(reply, 403, "forbidden");
    }

    const reminder = await familyStore.createReminder(familyId, {
      type,
      title,
      dueAt,
      createdByMemberId,
      assigneeMemberId,
      targetScope,
      targetMemberIds,
      frequency,
      schedule: schedule
        ? {
            targetLabel: optionalString(schedule, "targetLabel"),
            frequencyLabel: optionalString(schedule, "frequencyLabel"),
            timesOfDay: optionalStringArray(schedule, "timesOfDay"),
            birthdayDate: optionalString(schedule, "birthdayDate"),
            advanceDays: optionalPositiveInteger(schedule, "advanceDays") ?? 0,
            notifyOnDay: typeof schedule.notifyOnDay === "boolean" ? schedule.notifyOnDay : undefined,
          }
        : undefined,
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
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    const reminder = await familyStore.getReminder(reminderId);

    if (!reminder) {
      return sendApiError(reply, 404, "reminder_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const actorMemberId = requiredString(request.body, "actorMemberId");
    const actor = actorMemberId ? await familyStore.getMember(actorMemberId) : undefined;

    if (!canActAsMember(actor, authUser)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!actorMemberId || !isFamilyMember(actor, reminder.familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    return reply.code(200).send({
      data: await familyStore.completeReminder(reminderId, actorMemberId),
    });
  });

  server.post("/v1/wechat/session", async (request, reply) => {
    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const code = requiredString(request.body, "code");

    if (!code) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    try {
      const identity = await exchangeWechatCode(code);
      const appSession = await familyStore.createUserSession({
        userId: identity.userId,
        wechatOpenId: identity.wechatOpenId,
      });

      return {
        data: {
          ...identity,
          token: appSession.token,
          user: appSession.user,
          expiresAt: appSession.expiresAt,
        },
      };
    } catch (error) {
      request.log.error({ error }, "wechat session exchange failed");
      return sendApiError(reply, 502, "wechat_session_failed");
    }
  });

  const dispatchDueReminders = async (request: FastifyRequest, reply: FastifyReply) => {
    const cronSecret = process.env.CRON_SECRET?.trim() || process.env.NESTFUL_CRON_SECRET?.trim();
    const query = isObject(request.query) ? request.query : {};
    const querySecret = typeof query.secret === "string" ? query.secret : undefined;
    const authHeader = request.headers.authorization;
    const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

    if (cronSecret && querySecret !== cronSecret && bearerSecret !== cronSecret) {
      return sendApiError(reply, 401, "unauthorized");
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
      return sendApiError(reply, 404, "family_not_found");
    }

    return {
      data: await familyStore.listActivities(familyId),
    };
  });

  server.get("/v1/families/:familyId/activities/:activityId", async (request, reply) => {
    const { familyId, activityId } = request.params as { familyId: string; activityId: string };
    const activity = await familyStore.getActivity(activityId);

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!activity || activity.familyId !== familyId) {
      return sendApiError(reply, 404, "activity_not_found");
    }

    return {
      data: activity,
    };
  });

  server.post("/v1/families/:familyId/activities", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const title = requiredString(request.body, "title");
    const startsAt = requiredString(request.body, "startsAt");
    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const location = optionalString(request.body, "location");
    const description = optionalString(request.body, "description");
    const participantMemberIds = optionalStringArray(request.body, "participantMemberIds") ?? [];
    const rawTasks = Array.isArray(request.body.tasks) ? request.body.tasks : [];
    const tasks = rawTasks.map((task) =>
      isObject(task)
        ? {
            title: requiredString(task, "title"),
            assigneeMemberId: optionalString(task, "assigneeMemberId"),
          }
        : undefined,
    );
    const creator = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;
    const participantMembers = await Promise.all(participantMemberIds.map((id) => familyStore.getMember(id)));
    const taskAssigneeIds = tasks.map((task) => task?.assigneeMemberId).filter(Boolean) as string[];
    const taskAssignees = await Promise.all(taskAssigneeIds.map((id) => familyStore.getMember(id)));

    if (!title || !startsAt || !createdByMemberId) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (tasks.some((task) => !task?.title)) {
      return sendApiError(reply, 400, "invalid_activity_task");
    }

    if (Number.isNaN(Date.parse(startsAt))) {
      return sendApiError(reply, 400, "invalid_starts_at");
    }

    if (!canActAsMember(creator, authUser)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(creator, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (participantMembers.some((member) => !isFamilyMember(member, familyId))) {
      return sendApiError(reply, 400, "invalid_activity_participant");
    }

    if (taskAssignees.some((member) => !isFamilyMember(member, familyId))) {
      return sendApiError(reply, 400, "invalid_activity_task_assignee");
    }

    return reply.code(201).send({
      data: await familyStore.createActivity(familyId, {
        title,
        startsAt,
        createdByMemberId,
        location,
        description,
        participantMemberIds,
        tasks: tasks.map((task) => ({
          title: task?.title ?? "",
          assigneeMemberId: task?.assigneeMemberId,
        })),
      }),
    });
  });

  server.post("/v1/families/:familyId/activities/:activityId/rsvp", async (request, reply) => {
    const { familyId, activityId } = request.params as { familyId: string; activityId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    const activity = await familyStore.getActivity(activityId);

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!activity || activity.familyId !== familyId) {
      return sendApiError(reply, 404, "activity_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const actorMemberId = requiredString(request.body, "actorMemberId");
    const memberId = requiredString(request.body, "memberId");
    const rsvp = optionalRsvpStatus(request.body, "rsvp");
    const actor = actorMemberId ? await familyStore.getMember(actorMemberId) : undefined;
    const member = memberId ? await familyStore.getMember(memberId) : undefined;

    if (!actorMemberId || !memberId || !rsvp) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (!canActAsMember(actor, authUser) || actorMemberId !== memberId) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(actor, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(member, familyId)) {
      return sendApiError(reply, 400, "invalid_activity_participant");
    }

    return {
      data: await familyStore.updateActivityRsvp(activityId, {
        actorMemberId,
        memberId,
        rsvp,
      }),
    };
  });

  server.post("/v1/families/:familyId/activities/:activityId/tasks", async (request, reply) => {
    const { familyId, activityId } = request.params as { familyId: string; activityId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    const activity = await familyStore.getActivity(activityId);

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!activity || activity.familyId !== familyId) {
      return sendApiError(reply, 404, "activity_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const actorMemberId = requiredString(request.body, "actorMemberId");
    const title = requiredString(request.body, "title");
    const assigneeMemberId = optionalString(request.body, "assigneeMemberId");
    const actor = actorMemberId ? await familyStore.getMember(actorMemberId) : undefined;
    const assignee = assigneeMemberId ? await familyStore.getMember(assigneeMemberId) : undefined;

    if (!actorMemberId || !title) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (!canActAsMember(actor, authUser) || !canManageActivity(actor, activity)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(actor, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (assigneeMemberId && !isFamilyMember(assignee, familyId)) {
      return sendApiError(reply, 400, "invalid_activity_task_assignee");
    }

    return reply.code(201).send({
      data: await familyStore.createActivityTask(activityId, {
        actorMemberId,
        title,
        assigneeMemberId,
      }),
    });
  });

  server.put("/v1/families/:familyId/activities/:activityId/tasks/:taskId", async (request, reply) => {
    const { familyId, activityId, taskId } = request.params as { familyId: string; activityId: string; taskId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    const activity = await familyStore.getActivity(activityId);

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!activity || activity.familyId !== familyId) {
      return sendApiError(reply, 404, "activity_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const actorMemberId = requiredString(request.body, "actorMemberId");
    const status = optionalActivityTaskStatus(request.body, "status");
    const actor = actorMemberId ? await familyStore.getMember(actorMemberId) : undefined;
    const task = activity.tasks?.find((item) => item.id === taskId);

    if (!actorMemberId || !status) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (!task) {
      return sendApiError(reply, 404, "activity_task_not_found");
    }

    if (
      !canActAsMember(actor, authUser) ||
      (!canManageActivity(actor, activity) && task.assigneeMemberId !== actorMemberId)
    ) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(actor, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    return {
      data: await familyStore.updateActivityTask(activityId, taskId, {
        actorMemberId,
        status,
      }),
    };
  });

  server.put("/v1/families/:familyId/activities/:activityId/status", async (request, reply) => {
    const { familyId, activityId } = request.params as { familyId: string; activityId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    const activity = await familyStore.getActivity(activityId);

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!activity || activity.familyId !== familyId) {
      return sendApiError(reply, 404, "activity_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const actorMemberId = requiredString(request.body, "actorMemberId");
    const status = optionalActivityStatus(request.body, "status");
    const actor = actorMemberId ? await familyStore.getMember(actorMemberId) : undefined;

    if (!actorMemberId || !status) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (status !== "completed" && status !== "cancelled") {
      return sendApiError(reply, 400, "invalid_activity_status");
    }

    if (!canActAsMember(actor, authUser) || !canManageActivity(actor, activity)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(actor, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (activity.status === "completed" && status === "cancelled") {
      return sendApiError(reply, 400, "activity_already_completed");
    }

    return {
      data: await familyStore.updateActivityStatus(activityId, {
        actorMemberId,
        status,
      }),
    };
  });

  server.get("/v1/families/:familyId/ledger-entries", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    return {
      data: await familyStore.listLedgerEntries(familyId),
    };
  });

  server.get("/v1/families/:familyId/ledger-summary", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const query = isObject(request.query) ? request.query : {};
    const month = optionalString(query, "month");

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return sendApiError(reply, 400, "invalid_month");
    }

    return {
      data: await familyStore.getLedgerMonthlySummary(familyId, month),
    };
  });

  server.get("/v1/families/:familyId/ledger-goal-funds", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    return {
      data: await familyStore.listLedgerGoalFunds(familyId),
    };
  });

  server.post("/v1/families/:familyId/ledger-goal-funds", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const title = requiredString(request.body, "title");
    const targetAmountCents = optionalPositiveInteger(request.body, "targetAmountCents");
    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const dueAt = optionalString(request.body, "dueAt");
    const currentAmountValue = request.body.currentAmountCents;
    const currentAmountCents =
      typeof currentAmountValue === "number" && Number.isInteger(currentAmountValue) && currentAmountValue >= 0
        ? currentAmountValue
        : undefined;
    const creator = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;

    if (!title || !targetAmountCents || !createdByMemberId) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (hasKey(request.body, "currentAmountCents") && currentAmountCents === undefined) {
      return sendApiError(reply, 400, "invalid_current_amount");
    }

    if (dueAt && Number.isNaN(Date.parse(dueAt))) {
      return sendApiError(reply, 400, "invalid_due_at");
    }

    if (!canActAsMember(creator, authUser)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(creator, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    return reply.code(201).send({
      data: await familyStore.createLedgerGoalFund(familyId, {
        title,
        targetAmountCents,
        currentAmountCents,
        createdByMemberId,
        dueAt,
      }),
    });
  });

  server.post("/v1/families/:familyId/ledger-entries", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const type = optionalLedgerEntryType(request.body, "type");
    const category = optionalLedgerCategory(request.body, "category");
    const title = requiredString(request.body, "title");
    const amountCents = optionalPositiveInteger(request.body, "amountCents");
    const paidByMemberId = requiredString(request.body, "paidByMemberId");
    const splitMemberIds = optionalStringArray(request.body, "splitMemberIds");
    const occurredAt = requiredString(request.body, "occurredAt");
    const recurrence = optionalLedgerRecurrence(request.body, "recurrence");
    const paidByMember = paidByMemberId ? await familyStore.getMember(paidByMemberId) : undefined;
    const splitMembers = splitMemberIds ? await Promise.all(splitMemberIds.map((id) => familyStore.getMember(id))) : [];

    if (!type || !category || !title || !amountCents || !paidByMemberId || !occurredAt) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (hasKey(request.body, "splitMemberIds") && !splitMemberIds) {
      return sendApiError(reply, 400, "invalid_split_members");
    }

    if (hasKey(request.body, "recurrence") && request.body.recurrence !== undefined && !recurrence) {
      return sendApiError(reply, 400, "invalid_ledger_recurrence");
    }

    if (Number.isNaN(Date.parse(occurredAt))) {
      return sendApiError(reply, 400, "invalid_occurred_at");
    }

    if (!canActAsMember(paidByMember, authUser)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(paidByMember, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (splitMembers.some((member) => !isFamilyMember(member, familyId))) {
      return sendApiError(reply, 400, "invalid_split_member");
    }

    if (recurrence && (type !== "expense" || !["housing", "subscription"].includes(category))) {
      return sendApiError(reply, 400, "invalid_ledger_recurrence");
    }

    return reply.code(201).send({
      data: await familyStore.createLedgerEntry(familyId, {
        type,
        category,
        title,
        amountCents,
        paidByMemberId,
        splitMemberIds,
        occurredAt,
        recurrence,
      }),
    });
  });

  server.get("/v1/families/:familyId/digital-space-items", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const query = isObject(request.query) ? request.query : {};
    const kind = optionalDigitalSpaceKind(query, "kind");

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    return {
      data: await familyStore.listDigitalSpaceItems(familyId, kind),
    };
  });

  server.post("/v1/families/:familyId/digital-space-items", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const authUser = await requireAuthenticatedUser(request, reply);

    if (!authUser) {
      return;
    }

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    if (!isObject(request.body)) {
      return sendApiError(reply, 400, "body_required");
    }

    const kind = optionalDigitalSpaceKind(request.body, "kind");
    const title = requiredString(request.body, "title");
    const createdByMemberId = requiredString(request.body, "createdByMemberId");
    const summary = optionalString(request.body, "summary");
    const url = optionalString(request.body, "url");
    const occurredAt = optionalString(request.body, "occurredAt");
    const activityId = optionalString(request.body, "activityId");
    const place = optionalString(request.body, "place");
    const taggedMemberIds = optionalStringArray(request.body, "taggedMemberIds") ?? [];
    const rawMediaItems = Array.isArray(request.body.mediaItems) ? request.body.mediaItems : [];
    const mediaItems = rawMediaItems.map((media) =>
      isObject(media)
        ? {
            kind: optionalDigitalSpaceMediaKind(media, "kind"),
            label: optionalString(media, "label"),
            url: optionalString(media, "url"),
            mimeType: optionalString(media, "mimeType"),
            sizeBytes:
              typeof media.sizeBytes === "number" && Number.isInteger(media.sizeBytes) && media.sizeBytes > 0
                ? media.sizeBytes
                : undefined,
          }
        : undefined,
    );
    const creator = createdByMemberId ? await familyStore.getMember(createdByMemberId) : undefined;
    const activity = activityId ? await familyStore.getActivity(activityId) : undefined;
    const taggedMembers = await Promise.all(taggedMemberIds.map((id) => familyStore.getMember(id)));

    if (!kind || !title || !createdByMemberId) {
      return sendApiError(reply, 400, "missing_required_fields");
    }

    if (!canActAsMember(creator, authUser)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (!isFamilyMember(creator, familyId)) {
      return sendApiError(reply, 403, "forbidden");
    }

    if (occurredAt && Number.isNaN(Date.parse(occurredAt))) {
      return sendApiError(reply, 400, "invalid_occurred_at");
    }

    if (activityId && (!activity || activity.familyId !== familyId)) {
      return sendApiError(reply, 400, "invalid_activity");
    }

    if (taggedMembers.some((member) => !isFamilyMember(member, familyId))) {
      return sendApiError(reply, 400, "invalid_tagged_member");
    }

    if (mediaItems.some((media) => !media?.kind)) {
      return sendApiError(reply, 400, "invalid_media_item");
    }

    return reply.code(201).send({
      data: await familyStore.createDigitalSpaceItem(familyId, {
        kind,
        title,
        createdByMemberId,
        summary,
        url,
        occurredAt,
        activityId,
        place,
        taggedMemberIds,
        mediaItems: mediaItems.map((media) => ({
          kind: media?.kind ?? "link",
          label: media?.label,
          url: media?.url,
          mimeType: media?.mimeType,
          sizeBytes: media?.sizeBytes,
        })),
      }),
    });
  });

  server.get("/v1/families/:familyId/audit-events", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };

    if (!(await familyStore.getFamily(familyId))) {
      return sendApiError(reply, 404, "family_not_found");
    }

    return {
      data: await familyStore.listAuditEvents(familyId),
    };
  });
}
