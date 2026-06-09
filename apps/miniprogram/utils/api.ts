import { getApiBaseUrl } from "./config";
import { session } from "./session";

export interface ApiResponse<T> {
  data: T;
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
  role: "admin" | "member" | "elder" | "child" | "guest";
  birthday?: string;
  birthdayCalendar?: "solar" | "lunar";
  location?: string;
  emergencyContact?: string;
  joinedAt?: string;
}

export interface AppUser {
  id: string;
  wechatOpenId?: string;
  nickname: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface WechatSession {
  userId: string;
  wechatOpenId?: string;
  configured: boolean;
  token: string;
  user: AppUser;
  expiresAt: string;
}

export interface FamilyInvitation {
  id: string;
  familyId: string;
  code: string;
  role: FamilyMember["role"];
  createdByMemberId: string;
  createdAt: string;
  expiresAt?: string;
  canceledAt?: string;
  acceptedAt?: string;
  acceptedByMemberId?: string;
  status?: "active" | "accepted" | "expired" | "canceled";
  joinPath?: string;
}

export type ReminderType = "birthday" | "anniversary" | "medicine" | "exercise" | "bill" | "activity";

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

export type LedgerEntryType = "expense" | "income";
export type LedgerCategory = "daily" | "education" | "health" | "travel" | "housing" | "subscription" | "other";
export type LedgerRecurrence = "monthly" | "yearly";
export type DigitalSpaceItemKind = "document" | "account" | "memory";
export type DigitalSpaceMediaKind = "image" | "video" | "file" | "link";

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

export interface Activity {
  id: string;
  familyId: string;
  title: string;
  status: "draft" | "scheduled" | "completed" | "cancelled";
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

export type RsvpStatus = "accepted" | "declined" | "tentative" | "pending";
export type ActivityTaskStatus = "open" | "done";

const authHeaders = () => {
  const token = session.getToken();

  return token ? { authorization: `Bearer ${token}` } : {};
};

class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly data: unknown,
  ) {
    super(`Request failed with status ${statusCode}`);
  }
}

const loginCode = (): Promise<string | undefined> =>
  new Promise((resolve) => {
    wx.login({
      success: (loginResult) => {
        resolve(loginResult.code || undefined);
      },
      fail: () => {
        resolve(undefined);
      },
    });
  });

let sessionRefresh: Promise<boolean> | undefined;

const sendRequest = <T>(options: WechatMiniprogram.RequestOption): Promise<T> =>
  new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${getApiBaseUrl()}${options.url}`,
      timeout: 8000,
      header: {
        ...(options.data === undefined ? {} : { "content-type": "application/json" }),
        ...authHeaders(),
        ...(options.header ?? {}),
      },
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }

        reject(new ApiRequestError(response.statusCode, response.data));
      },
      fail: reject,
    });
  });

const refreshAppSession = async () => {
  sessionRefresh ??= (async () => {
    const code = await loginCode();

    if (!code) {
      return false;
    }

    try {
      const response = await sendRequest<ApiResponse<WechatSession>>({
        method: "POST",
        url: "/v1/wechat/session",
        data: { code },
      });
      session.setToken(response.data.token, response.data.expiresAt);

      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await sessionRefresh;
  } finally {
    sessionRefresh = undefined;
  }
};

const shouldRefreshSession = (options: WechatMiniprogram.RequestOption, error: unknown) =>
  error instanceof ApiRequestError && error.statusCode === 401 && options.url !== "/v1/wechat/session";

const request = async <T>(options: WechatMiniprogram.RequestOption): Promise<T> => {
  try {
    return await sendRequest<T>(options);
  } catch (error) {
    if (shouldRefreshSession(options, error) && (await refreshAppSession())) {
      return sendRequest<T>(options);
    }

    throw error;
  }
};

export const api = {
  createFamily(body: { name: string; ownerUserId: string; ownerDisplayName: string; ownerWechatOpenId?: string }) {
    return request<ApiResponse<{ family: Family; ownerMember: FamilyMember }>>({
      method: "POST",
      url: "/v1/families",
      data: body,
    });
  },

  createWechatSession(body: { code: string }) {
    return request<ApiResponse<WechatSession>>({
      method: "POST",
      url: "/v1/wechat/session",
      data: body,
    });
  },

  getFamily(familyId: string) {
    return request<ApiResponse<Family>>({
      method: "GET",
      url: `/v1/families/${familyId}`,
    });
  },

  listMembers(familyId: string) {
    return request<ApiResponse<FamilyMember[]>>({
      method: "GET",
      url: `/v1/families/${familyId}/members`,
    });
  },

  getMember(familyId: string, memberId: string) {
    return request<ApiResponse<FamilyMember>>({
      method: "GET",
      url: `/v1/families/${familyId}/members/${memberId}`,
    });
  },

  updateMember(
    familyId: string,
    memberId: string,
    body: {
      displayName?: string;
      role?: FamilyMember["role"];
      birthday?: string;
      birthdayCalendar?: "solar" | "lunar";
      location?: string;
      emergencyContact?: string;
    },
  ) {
    return request<ApiResponse<FamilyMember>>({
      method: "PUT",
      url: `/v1/families/${familyId}/members/${memberId}`,
      data: body,
    });
  },

  removeMember(familyId: string, memberId: string) {
    return request<ApiResponse<FamilyMember>>({
      method: "DELETE",
      url: `/v1/families/${familyId}/members/${memberId}`,
    });
  },

  createInvitation(familyId: string, body: { createdByMemberId: string; role: FamilyMember["role"] }) {
    return request<ApiResponse<{ invitation: FamilyInvitation; joinPath: string }>>({
      method: "POST",
      url: `/v1/families/${familyId}/invitations`,
      data: body,
    });
  },

  listInvitations(familyId: string) {
    return request<ApiResponse<FamilyInvitation[]>>({
      method: "GET",
      url: `/v1/families/${familyId}/invitations`,
    });
  },

  cancelInvitation(familyId: string, invitationId: string) {
    return request<ApiResponse<FamilyInvitation>>({
      method: "DELETE",
      url: `/v1/families/${familyId}/invitations/${invitationId}`,
    });
  },

  getInvitation(code: string) {
    return request<ApiResponse<FamilyInvitation>>({
      method: "GET",
      url: `/v1/invitations/${code}`,
    });
  },

  acceptInvitation(code: string, body: { displayName: string; userId: string; wechatOpenId?: string }) {
    return request<ApiResponse<{ invitation: FamilyInvitation; member: FamilyMember }>>({
      method: "POST",
      url: `/v1/invitations/${code}/accept`,
      data: body,
    });
  },

  listReminders(familyId: string) {
    return request<ApiResponse<Reminder[]>>({
      method: "GET",
      url: `/v1/families/${familyId}/reminders`,
    });
  },

  getReminderSubscriptionConfig(type?: ReminderType) {
    return request<ApiResponse<{ enabled: boolean; templateId?: string }>>({
      method: "GET",
      url: type ? `/v1/reminders/subscription-config/${type}` : "/v1/reminders/subscription-config",
    });
  },

  createReminder(
    familyId: string,
    body: {
      type: ReminderType;
      title: string;
      dueAt: string;
      createdByMemberId: string;
      assigneeMemberId?: string;
      targetScope?: ReminderTargetScope;
      targetMemberIds?: string[];
      frequency?: ReminderFrequency;
      schedule?: ReminderSchedule;
      notificationSubscription?: {
        templateId: string;
        recipientMemberId: string;
        subscriptionStatus: ReminderNotification["subscriptionStatus"];
      };
    },
  ) {
    return request<ApiResponse<Reminder>>({
      method: "POST",
      url: `/v1/families/${familyId}/reminders`,
      data: body,
    });
  },

  completeReminder(reminderId: string, body: { actorMemberId: string }) {
    return request<ApiResponse<Reminder>>({
      method: "POST",
      url: `/v1/reminders/${reminderId}/complete`,
      data: body,
    });
  },

  listLedgerEntries(familyId: string) {
    return request<ApiResponse<LedgerEntry[]>>({
      method: "GET",
      url: `/v1/families/${familyId}/ledger-entries`,
    });
  },

  createLedgerEntry(
    familyId: string,
    body: {
      type: LedgerEntryType;
      category: LedgerCategory;
      title: string;
      amountCents: number;
      paidByMemberId: string;
      splitMemberIds?: string[];
      occurredAt: string;
      recurrence?: LedgerRecurrence;
    },
  ) {
    return request<ApiResponse<LedgerEntry>>({
      method: "POST",
      url: `/v1/families/${familyId}/ledger-entries`,
      data: body,
    });
  },

  getLedgerSummary(familyId: string, month?: string) {
    return request<ApiResponse<LedgerMonthlySummary>>({
      method: "GET",
      url: `/v1/families/${familyId}/ledger-summary${month ? `?month=${month}` : ""}`,
    });
  },

  listLedgerGoalFunds(familyId: string) {
    return request<ApiResponse<LedgerGoalFund[]>>({
      method: "GET",
      url: `/v1/families/${familyId}/ledger-goal-funds`,
    });
  },

  createLedgerGoalFund(
    familyId: string,
    body: {
      title: string;
      targetAmountCents: number;
      currentAmountCents?: number;
      createdByMemberId: string;
      dueAt?: string;
    },
  ) {
    return request<ApiResponse<LedgerGoalFund>>({
      method: "POST",
      url: `/v1/families/${familyId}/ledger-goal-funds`,
      data: body,
    });
  },

  listDigitalSpaceItems(familyId: string) {
    return request<ApiResponse<DigitalSpaceItem[]>>({
      method: "GET",
      url: `/v1/families/${familyId}/digital-space-items`,
    });
  },

  createDigitalSpaceItem(
    familyId: string,
    body: {
      kind: DigitalSpaceItemKind;
      title: string;
      createdByMemberId: string;
      summary?: string;
      url?: string;
      occurredAt?: string;
      activityId?: string;
      place?: string;
      taggedMemberIds?: string[];
      mediaItems?: Array<{
        kind: DigitalSpaceMediaKind;
        label?: string;
        url?: string;
        mimeType?: string;
        sizeBytes?: number;
      }>;
    },
  ) {
    return request<ApiResponse<DigitalSpaceItem>>({
      method: "POST",
      url: `/v1/families/${familyId}/digital-space-items`,
      data: body,
    });
  },

  listActivities(familyId: string) {
    return request<ApiResponse<Activity[]>>({
      method: "GET",
      url: `/v1/families/${familyId}/activities`,
    });
  },

  createActivity(
    familyId: string,
    body: {
      title: string;
      startsAt: string;
      createdByMemberId: string;
      location?: string;
      description?: string;
      participantMemberIds?: string[];
      tasks?: Array<{ title: string; assigneeMemberId?: string }>;
    },
  ) {
    return request<ApiResponse<Activity>>({
      method: "POST",
      url: `/v1/families/${familyId}/activities`,
      data: body,
    });
  },

  getActivity(familyId: string, activityId: string) {
    return request<ApiResponse<Activity>>({
      method: "GET",
      url: `/v1/families/${familyId}/activities/${activityId}`,
    });
  },

  updateActivityRsvp(
    familyId: string,
    activityId: string,
    body: { actorMemberId: string; memberId: string; rsvp: RsvpStatus },
  ) {
    return request<ApiResponse<Activity>>({
      method: "POST",
      url: `/v1/families/${familyId}/activities/${activityId}/rsvp`,
      data: body,
    });
  },

  createActivityTask(
    familyId: string,
    activityId: string,
    body: { actorMemberId: string; title: string; assigneeMemberId?: string },
  ) {
    return request<ApiResponse<Activity>>({
      method: "POST",
      url: `/v1/families/${familyId}/activities/${activityId}/tasks`,
      data: body,
    });
  },

  updateActivityTask(
    familyId: string,
    activityId: string,
    taskId: string,
    body: { actorMemberId: string; status: ActivityTaskStatus },
  ) {
    return request<ApiResponse<Activity>>({
      method: "PUT",
      url: `/v1/families/${familyId}/activities/${activityId}/tasks/${taskId}`,
      data: body,
    });
  },

  updateActivityStatus(
    familyId: string,
    activityId: string,
    body: { actorMemberId: string; status: "completed" | "cancelled" },
  ) {
    return request<ApiResponse<Activity>>({
      method: "PUT",
      url: `/v1/families/${familyId}/activities/${activityId}/status`,
      data: body,
    });
  },
};
