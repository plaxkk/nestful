import { randomUUID } from "node:crypto";
import type { Activity, Family, FamilyInvitation, FamilyMember, FamilyRole, Reminder } from "@family-housekeeper/shared";

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

const families: Family[] = [];
const members: FamilyMember[] = [];
const invitations: FamilyInvitation[] = [];
const reminders: Reminder[] = [];
const activities: Activity[] = [];

const now = () => new Date().toISOString();

const createCode = () => randomUUID().replaceAll("-", "").slice(0, 10);

export const familyStore = {
  listFamilies() {
    return families;
  },

  getFamily(familyId: string) {
    return families.find((family) => family.id === familyId);
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

    families.push(family);
    members.push(ownerMember);

    return { family, ownerMember };
  },

  listMembers(familyId: string) {
    return members.filter((member) => member.familyId === familyId);
  },

  getMember(memberId: string) {
    return members.find((member) => member.id === memberId);
  },

  createMember(familyId: string, input: CreateMemberInput) {
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

    members.push(member);

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

    invitations.push(invitation);

    return invitation;
  },

  getInvitationByCode(code: string) {
    return invitations.find((invitation) => invitation.code === code);
  },

  acceptInvitation(code: string, input: CreateMemberInput) {
    const invitation = this.getInvitationByCode(code);

    if (!invitation || invitation.acceptedAt) {
      return undefined;
    }

    if (invitation.expiresAt && Date.parse(invitation.expiresAt) < Date.now()) {
      return undefined;
    }

    const member = this.createMember(invitation.familyId, {
      ...input,
      role: invitation.role,
    });

    invitation.acceptedAt = now();
    invitation.acceptedByMemberId = member.id;

    return { invitation, member };
  },

  listReminders(familyId: string) {
    return reminders.filter((reminder) => reminder.familyId === familyId);
  },

  listActivities(familyId: string) {
    return activities.filter((activity) => activity.familyId === familyId);
  },
};
