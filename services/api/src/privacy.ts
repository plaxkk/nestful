import type { FamilyMember, FamilyRole } from "@family-housekeeper/shared";

const familyAdminRoles: FamilyRole[] = ["admin"];

export const isFamilyMember = (member: FamilyMember | undefined, familyId: string) =>
  Boolean(member && member.familyId === familyId);

export const canManageFamily = (member: FamilyMember | undefined, familyId: string) => {
  if (!member || !isFamilyMember(member, familyId)) {
    return false;
  }

  return familyAdminRoles.includes(member.role);
};

export const canCreateInvitation = (member: FamilyMember | undefined, familyId: string) =>
  canManageFamily(member, familyId);

export const canAddMemberDirectly = (member: FamilyMember | undefined, familyId: string) =>
  canManageFamily(member, familyId);

export const redactMemberForList = (member: FamilyMember): FamilyMember => ({
  id: member.id,
  familyId: member.familyId,
  userId: member.userId,
  displayName: member.displayName,
  role: member.role,
  birthday: member.birthday,
  birthdayCalendar: member.birthdayCalendar,
  location: member.location,
  joinedAt: member.joinedAt,
});
