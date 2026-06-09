const apiBaseUrl = "https://nestful.kkplayit.online";

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

export interface FamilyInvitation {
  id: string;
  familyId: string;
  code: string;
  role: FamilyMember["role"];
  createdByMemberId: string;
  createdAt: string;
  expiresAt?: string;
  acceptedAt?: string;
  acceptedByMemberId?: string;
}

export type ReminderType = "birthday" | "medicine" | "exercise";

export interface Reminder {
  id: string;
  familyId: string;
  type: ReminderType;
  title: string;
  dueAt: string;
  assigneeMemberId?: string;
  targetScope?: ReminderTargetScope;
  targetMemberIds?: string[];
  frequency?: ReminderFrequency;
  schedule?: ReminderSchedule;
  createdByMemberId: string;
  enabled: boolean;
  notification?: ReminderNotification;
  completedAt?: string;
}

export type ReminderTargetScope = "member" | "family";
export type ReminderFrequency = "once" | "daily_once" | "daily_twice" | "daily_three_times" | "weekly" | "yearly";

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
}

export type LedgerEntryType = "expense" | "income";
export type LedgerCategory = "daily" | "education" | "health" | "travel" | "housing" | "subscription" | "other";
export type DigitalSpaceItemKind = "document" | "account" | "memory";

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

export interface DigitalSpaceItem {
  id: string;
  familyId: string;
  kind: DigitalSpaceItemKind;
  title: string;
  summary?: string;
  url?: string;
  occurredAt?: string;
  createdByMemberId: string;
  taggedMemberIds: string[];
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
}

const request = <T>(options: WechatMiniprogram.RequestOption): Promise<T> =>
  new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${apiBaseUrl}${options.url}`,
      timeout: 8000,
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }

        reject(new Error(`Request failed with status ${response.statusCode}`));
      },
      fail: reject,
    });
  });

export const api = {
  createFamily(body: { name: string; ownerUserId: string; ownerDisplayName: string; ownerWechatOpenId?: string }) {
    return request<ApiResponse<{ family: Family; ownerMember: FamilyMember }>>({
      method: "POST",
      url: "/v1/families",
      data: body,
    });
  },

  createWechatSession(body: { code: string }) {
    return request<ApiResponse<{ userId: string; wechatOpenId?: string; configured: boolean }>>({
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

  createInvitation(familyId: string, body: { createdByMemberId: string; role: FamilyMember["role"] }) {
    return request<ApiResponse<{ invitation: FamilyInvitation; joinPath: string }>>({
      method: "POST",
      url: `/v1/families/${familyId}/invitations`,
      data: body,
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
      occurredAt: string;
    },
  ) {
    return request<ApiResponse<LedgerEntry>>({
      method: "POST",
      url: `/v1/families/${familyId}/ledger-entries`,
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
    body: { title: string; startsAt: string; createdByMemberId: string; location?: string; description?: string },
  ) {
    return request<ApiResponse<Activity>>({
      method: "POST",
      url: `/v1/families/${familyId}/activities`,
      data: body,
    });
  },
};
