import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Activity,
  AuditEvent,
  Family,
  FamilyInvitation,
  FamilyMember,
  FamilyRole,
  Reminder,
} from "@family-housekeeper/shared";

export interface CreateFamilyInput {
  name: string;
  ownerUserId: string;
  ownerDisplayName: string;
}

export interface CreateMemberInput {
  displayName: string;
  role?: FamilyRole;
  userId?: string;
  birthday?: string;
  birthdayCalendar?: "solar" | "lunar";
  location?: string;
  emergencyContact?: string;
}

export interface CreateInvitationInput {
  createdByMemberId: string;
  role?: FamilyRole;
  expiresAt?: string;
}

interface StoreState {
  families: Family[];
  members: FamilyMember[];
  invitations: FamilyInvitation[];
  reminders: Reminder[];
  activities: Activity[];
  auditEvents: AuditEvent[];
}

const defaultState = (): StoreState => ({
  families: [],
  members: [],
  invitations: [],
  reminders: [],
  activities: [],
  auditEvents: [],
});

const dataFile = resolve(process.env.DATA_FILE ?? ".data/family-housekeeper.json");

const now = () => new Date().toISOString();

const createCode = () => randomUUID().replaceAll("-", "").slice(0, 10);

const readState = (): StoreState => {
  try {
    const parsed = JSON.parse(readFileSync(dataFile, "utf8")) as Partial<StoreState>;

    return {
      ...defaultState(),
      ...parsed,
      families: parsed.families ?? [],
      members: parsed.members ?? [],
      invitations: parsed.invitations ?? [],
      reminders: parsed.reminders ?? [],
      activities: parsed.activities ?? [],
      auditEvents: parsed.auditEvents ?? [],
    };
  } catch (error) {
    return defaultState();
  }
};

let state = readState();

const persist = () => {
  mkdirSync(dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.${process.pid}.tmp`;

  writeFileSync(tempFile, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tempFile, dataFile);
};

const audit = (event: Omit<AuditEvent, "id" | "createdAt">) => {
  state.auditEvents.push({
    id: randomUUID(),
    createdAt: now(),
    ...event,
  });
};

export const familyStore = {
  listFamilies() {
    return state.families;
  },

  getFamily(familyId: string) {
    return state.families.find((family) => family.id === familyId);
  },

  createFamily(input: CreateFamilyInput) {
    const createdAt = now();
    const family: Family = {
      id: randomUUID(),
      name: input.name,
      ownerUserId: input.ownerUserId,
      createdAt,
    };
    const ownerMember: FamilyMember = {
      id: randomUUID(),
      familyId: family.id,
      userId: input.ownerUserId,
      displayName: input.ownerDisplayName,
      role: "admin",
      joinedAt: createdAt,
    };

    state.families.push(family);
    state.members.push(ownerMember);
    audit({
      familyId: family.id,
      actorMemberId: ownerMember.id,
      action: "family.created",
      resourceType: "family",
      resourceId: family.id,
    });
    persist();

    return { family, ownerMember };
  },

  listMembers(familyId: string) {
    return state.members.filter((member) => member.familyId === familyId);
  },

  getMember(memberId: string) {
    return state.members.find((member) => member.id === memberId);
  },

  createMember(familyId: string, input: CreateMemberInput, actorMemberId?: string) {
    const member: FamilyMember = {
      id: randomUUID(),
      familyId,
      userId: input.userId,
      displayName: input.displayName,
      role: input.role ?? "member",
      birthday: input.birthday,
      birthdayCalendar: input.birthdayCalendar,
      location: input.location,
      emergencyContact: input.emergencyContact,
      joinedAt: now(),
    };

    state.members.push(member);
    audit({
      familyId,
      actorMemberId,
      action: "member.created",
      resourceType: "member",
      resourceId: member.id,
    });
    persist();

    return member;
  },

  createInvitation(familyId: string, input: CreateInvitationInput) {
    const invitation: FamilyInvitation = {
      id: randomUUID(),
      familyId,
      code: createCode(),
      role: input.role ?? "member",
      createdByMemberId: input.createdByMemberId,
      createdAt: now(),
      expiresAt: input.expiresAt,
    };

    state.invitations.push(invitation);
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "invitation.created",
      resourceType: "invitation",
      resourceId: invitation.id,
    });
    persist();

    return invitation;
  },

  getInvitationByCode(code: string) {
    return state.invitations.find((invitation) => invitation.code === code);
  },

  acceptInvitation(code: string, input: CreateMemberInput) {
    const invitation = this.getInvitationByCode(code);

    if (!invitation || invitation.acceptedAt) {
      return undefined;
    }

    if (invitation.expiresAt && Date.parse(invitation.expiresAt) < Date.now()) {
      return undefined;
    }

    const alreadyMember = input.userId
      ? state.members.some((member) => member.familyId === invitation.familyId && member.userId === input.userId)
      : false;

    if (alreadyMember) {
      return undefined;
    }

    const member = this.createMember(
      invitation.familyId,
      {
        ...input,
        role: invitation.role,
      },
      invitation.createdByMemberId,
    );

    invitation.acceptedAt = now();
    invitation.acceptedByMemberId = member.id;
    audit({
      familyId: invitation.familyId,
      actorMemberId: member.id,
      action: "invitation.accepted",
      resourceType: "invitation",
      resourceId: invitation.id,
    });
    persist();

    return { invitation, member };
  },

  listReminders(familyId: string) {
    return state.reminders.filter((reminder) => reminder.familyId === familyId);
  },

  listActivities(familyId: string) {
    return state.activities.filter((activity) => activity.familyId === familyId);
  },

  listAuditEvents(familyId: string) {
    return state.auditEvents.filter((event) => event.familyId === familyId);
  },

  resetForTests() {
    state = defaultState();
    persist();
  },
};
