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

export type ActivityTaskStatus = "open" | "done";

export type LedgerCategory =
  | "daily"
  | "education"
  | "health"
  | "travel"
  | "housing"
  | "subscription"
  | "other";

export type LedgerEntryType = "expense" | "income";

export type LedgerRecurrence = "monthly" | "yearly";

export type DigitalSpaceItemKind = "document" | "account" | "memory";

export type DigitalSpaceMediaKind = "image" | "video" | "file" | "link";

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
  wechatOpenId?: string;
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
  canceledAt?: string;
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
  planId?: string;
  familyId: string;
  type: ReminderType;
  title: string;
  dueAt: string;
  occurrenceNumber?: number;
  occurrenceStatus?: ReminderOccurrenceStatus;
  assigneeMemberId?: string;
  targetScope?: ReminderTargetScope;
  targetMemberIds?: string[];
  frequency?: ReminderFrequency;
  schedule?: ReminderSchedule;
  createdByMemberId: string;
  enabled: boolean;
  notification?: ReminderNotification;
  completedByMemberId?: string;
  completedAt?: string;
}

export interface ReminderPlan {
  id: string;
  familyId: string;
  type: ReminderType;
  title: string;
  assigneeMemberId?: string;
  targetScope?: ReminderTargetScope;
  targetMemberIds?: string[];
  frequency: ReminderFrequency;
  schedule?: ReminderSchedule;
  createdByMemberId: string;
  enabled: boolean;
  createdAt: string;
  nextDueAt?: string;
  lastCompletedAt?: string;
  completedCount: number;
}

export type ReminderTargetScope = "member" | "family";

export type ReminderFrequency =
  | "once"
  | "daily_once"
  | "daily_twice"
  | "daily_three_times"
  | "weekly"
  | "monthly"
  | "yearly";

export type ReminderOccurrenceStatus = "pending" | "completed" | "skipped";

export interface ReminderSchedule {
  targetLabel?: string;
  frequencyLabel?: string;
  timesOfDay?: string[];
  birthdayDate?: string;
  advanceDays?: number;
  notifyOnDay?: boolean;
}

export interface ReminderNotification {
  templateId: string;
  recipientMemberId: string;
  recipientOpenId?: string;
  subscriptionStatus: "accept" | "reject" | "ban" | "filter" | "unavailable";
  sendStatus: "pending" | "sent" | "failed" | "skipped";
  requestedAt: string;
  sentAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  attemptCount: number;
  dispatchKey?: string;
}

export interface Activity {
  id: string;
  familyId: string;
  title: string;
  status: ActivityStatus;
  startsAt: string;
  location?: string;
  description?: string;
  budgetCents?: number;
  createdByMemberId: string;
  participants?: ActivityParticipant[];
  tasks?: ActivityTask[];
  memoryItemId?: string;
  completedAt?: string;
  cancelledAt?: string;
  sharePath?: string;
  shareText?: string;
}

export interface ActivityParticipant {
  activityId: string;
  memberId: string;
  rsvp: RsvpStatus;
  joinedAt: string;
}

export interface ActivityTask {
  id: string;
  activityId: string;
  familyId: string;
  title: string;
  assigneeMemberId?: string;
  status: ActivityTaskStatus;
  createdByMemberId: string;
  completedAt?: string;
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

export interface DigitalSpaceItem {
  id: string;
  familyId: string;
  kind: DigitalSpaceItemKind;
  title: string;
  summary?: string;
  url?: string;
  occurredAt?: string;
  createdByMemberId: string;
  activityId?: string;
  place?: string;
  taggedMemberIds: string[];
  mediaItems?: DigitalSpaceMediaItem[];
  securityWarning?: string;
  createdAt: string;
}

export interface DigitalSpaceMediaItem {
  id: string;
  kind: DigitalSpaceMediaKind;
  label?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
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
  recurrence?: LedgerRecurrence;
  recurringReminderId?: string;
}

export interface LedgerGoalFund {
  id: string;
  familyId: string;
  title: string;
  targetAmountCents: number;
  currentAmountCents: number;
  createdByMemberId: string;
  dueAt?: string;
  createdAt: string;
  completedAt?: string;
}

export interface LedgerCategoryTotal {
  category: LedgerCategory;
  amountCents: number;
  entryCount: number;
}

export interface LedgerMemberSplit {
  memberId: string;
  paidCents: number;
  owedCents: number;
  balanceCents: number;
  entryCount: number;
}

export interface LedgerMonthlySummary {
  familyId: string;
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  entryCount: number;
  categoryTotals: LedgerCategoryTotal[];
  memberSplits: LedgerMemberSplit[];
  goalFunds: LedgerGoalFund[];
}
