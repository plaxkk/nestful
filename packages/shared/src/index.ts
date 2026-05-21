export type FamilyRole = "admin" | "member" | "elder" | "child" | "guest";

export type ReminderType =
  | "birthday"
  | "anniversary"
  | "medicine"
  | "exercise"
  | "bill"
  | "activity";

export type ActivityStatus = "draft" | "scheduled" | "completed" | "cancelled";

export type RsvpStatus = "accepted" | "declined" | "tentative" | "pending";

export type LedgerCategory =
  | "daily"
  | "education"
  | "health"
  | "travel"
  | "housing"
  | "subscription"
  | "other";

export type LedgerEntryType = "expense" | "income";

export interface User {
  id: string;
  wechatOpenId?: string;
  nickname: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Family {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  userId?: string;
  displayName: string;
  role: FamilyRole;
  birthday?: string;
  birthdayCalendar?: "solar" | "lunar";
  location?: string;
  emergencyContact?: string;
  joinedAt?: string;
}

export interface FamilyInvitation {
  id: string;
  familyId: string;
  code: string;
  role: FamilyRole;
  createdByMemberId: string;
  createdAt: string;
  expiresAt?: string;
  acceptedAt?: string;
  acceptedByMemberId?: string;
}

export interface AuditEvent {
  id: string;
  familyId: string;
  actorMemberId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  familyId: string;
  type: ReminderType;
  title: string;
  dueAt: string;
  assigneeMemberId?: string;
  createdByMemberId: string;
  enabled: boolean;
  completedAt?: string;
}

export interface Activity {
  id: string;
  familyId: string;
  title: string;
  status: ActivityStatus;
  startsAt: string;
  location?: string;
  budgetCents?: number;
  createdByMemberId: string;
}

export interface ActivityParticipant {
  activityId: string;
  memberId: string;
  rsvp: RsvpStatus;
}

export interface MemoryItem {
  id: string;
  familyId: string;
  title: string;
  mediaUrl?: string;
  story?: string;
  activityId?: string;
  taggedMemberIds: string[];
  occurredAt?: string;
  place?: string;
}

export interface HealthPlan {
  id: string;
  familyId: string;
  memberId: string;
  title: string;
  kind: "medicine" | "exercise" | "review" | "measurement";
  scheduleText: string;
  caregiverMemberIds: string[];
}

export interface LedgerEntry {
  id: string;
  familyId: string;
  type: LedgerEntryType;
  category: LedgerCategory;
  title: string;
  amountCents: number;
  paidByMemberId: string;
  splitMemberIds: string[];
  occurredAt: string;
}
