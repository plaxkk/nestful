import { getApiBaseUrl } from "./config";
import { session } from "./session";

export interface ApiResponse<T> {
  data: T;
  nextCursor?: string;
}

export interface Family {
  version: number;
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
}

export interface FamilyMember {
  version: number;
  id: string;
  familyId: string;
  userId?: string;
  wechatOpenId?: string;
  displayName: string;
  role: "admin" | "member";
  birthday?: string;
  birthdayCalendar?: "solar" | "lunar";
  birthdayLeapMonth?: boolean;
  identityTag?: "elder" | "child" | "guest";
  status?: "active" | "inactive";
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

export interface FamilyMembership {
  family: Family;
  member: FamilyMember;
  members: FamilyMember[];
}

export interface FamilyInvitation {
  mode?: 'single' | 'group';
  maxUses?: number;
  useCount?: number;
  requiresApproval?: boolean;
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
  status?: "active" | "accepted" | "expired" | "canceled" | "full";
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
  participants: Array<{ memberId: string; status: ReminderOccurrenceStatus; completedAt?: string }>;
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
  birthdayCalendar?: "solar" | "lunar";
  birthdayLeapMonth?: boolean;
}

export interface ReminderNotification {
  templateId: string;
  recipientMemberId: string;
  recipientOpenId?: string;
  subscriptionStatus: "accept" | "reject" | "ban" | "filter" | "unavailable";
  sendStatus: "pending" | "processing" | "sent" | "failed" | "skipped" | "expired" | "unknown" | "canceled";
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
  createdByMemberId?: string;
  version: number;
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
  version: number;
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
  version: number;
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
  updatedAt?: string;
  version: number;
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
  version: number;
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

export interface DashboardItem { id: string; title: string; at: string; activityId?: string }
export interface FamilyDashboard { activities: DashboardItem[]; tasks: DashboardItem[]; reminders: DashboardItem[]; upcoming: DashboardItem[] }
export interface HomeBootstrap {
  families: FamilyMembership[];
  currentFamilyId: string;
  dashboard: FamilyDashboard | null;
  activity: Activity | null;
  joinRequestCount: number | null;
}
export interface JoinRequest { id: string; displayName: string; status: string; createdAt?: string; available: boolean }
export interface ReminderPlan {
  id: string; version: number; type: ReminderType; title: string; dueAt: string;
  frequency: ReminderFrequency; targetScope: ReminderTargetScope; assigneeMemberId?: string;
  targetMemberIds: string[]; schedule: ReminderSchedule; enabled: boolean;
}
export type JoinResult = { status: 'pending'; requestId: string; familyName: string } |
  { status: 'joined'; invitation: FamilyInvitation; family: Family; member: FamilyMember };

const authHeaders = () => {
  const token = session.getToken();

  return token ? { authorization: `Bearer ${token}` } : {};
};

export class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly data: unknown,
  ) {
    super(`Request failed with status ${statusCode}`);
  }
}

export const errorMessage = (error: unknown, fallback = '暂时无法完成，请稍后重试') => {
  if (!(error instanceof ApiRequestError)) return fallback;
  const code = (error.data as { error?: string } | undefined)?.error;
  if (code === 'last_admin_required') return '请先把另一位家人设为管理员，再退出';
  if (code === 'version_conflict') return '内容已被更新，请刷新后再试';
  if (code === 'invitation_unavailable') return '邀请已失效、已满或已撤销，请联系管理员';
  if (code === 'request_already_decided') return '申请已处理，请刷新查看';
  if (error.statusCode === 403) return '暂无操作权限，请确认家庭成员身份';
  if (error.statusCode === 401) return '登录未完成，请重新打开后重试';
  if (error.statusCode === 404) return '内容已不存在或暂不可访问';
  return fallback;
};

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

const wireBody = (options: WechatMiniprogram.RequestOption) => {
  if (!options.data || typeof options.data !== "object" || Array.isArray(options.data)) return options.data;
  const data = { ...options.data } as Record<string, unknown>;
  for (const key of ["ownerUserId", "ownerWechatOpenId", "userId", "wechatOpenId", "createdByMemberId", "actorMemberId"]) delete data[key];
  if (options.url.endsWith("/rsvp")) delete data.memberId;
  return data;
};

const sendRequest = <T>(options: WechatMiniprogram.RequestOption): Promise<T> =>
  new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${getApiBaseUrl()}${options.url}`,
      data: wireBody(options),
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
      session.setUser(response.data.user);

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
  let response: T;
  try {
    response = await sendRequest<T>(options);
  } catch (error) {
    if (shouldRefreshSession(options, error) && (await refreshAppSession())) {
      response = await sendRequest<T>(options);
    } else throw error;
  }
  if (options.method && options.method !== 'GET' && !options.url.startsWith('/v1/wechat/')) session.markHomeChanged();
  return response;
};

const listAll = async <T>(url: string): Promise<ApiResponse<T[]>> => {
  const data: T[] = [], seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const response: ApiResponse<T[]> = await request({ method: "GET", url: `${url}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}` });
    data.push(...response.data);
    cursor = response.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error("Invalid pagination cursor");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { data };
};

export const api = {
  getHome(familyId?: string, fallbackFamilyId?: string) {
    const params: string[] = [];
    if (familyId) params.push(`familyId=${encodeURIComponent(familyId)}`);
    if (fallbackFamilyId) params.push(`fallbackFamilyId=${encodeURIComponent(fallbackFamilyId)}`);
    return request<ApiResponse<HomeBootstrap>>({ method: 'GET', url: `/v1/me/home${params.length ? `?${params.join('&')}` : ''}` });
  },
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

  listMyFamilies() {
    return request<ApiResponse<FamilyMembership[]>>({
      method: "GET",
      url: "/v1/me/families",
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
      version: number;
      displayName?: string;
      role?: FamilyMember["role"];
      birthday?: string;
      birthdayCalendar?: "solar" | "lunar";
      birthdayLeapMonth?: boolean;
      identityTag?: "elder" | "child" | "guest" | null;
      status?: "active" | "inactive";
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

  removeMember(familyId: string, memberId: string, version: number) {
    return request<ApiResponse<FamilyMember>>({
      method: "DELETE",
      url: `/v1/families/${familyId}/members/${memberId}`,
      data: { version },
    });
  },

  createInvitation(familyId: string, body: { createdByMemberId?: string; role?: FamilyMember["role"]; mode?: 'single'|'group'; maxUses?: number; requiresApproval?: boolean }) {
    return request<ApiResponse<FamilyInvitation>>({
      method: "POST",
      url: `/v1/families/${familyId}/invitations`,
      data: body,
    }).then(response => ({ data: { invitation: response.data, joinPath: response.data.joinPath ?? "" } }));
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
    return request<ApiResponse<{ familyName: string; status: "active" | "accepted" | "expired" | "canceled" | "full"; expiresAt?: string; mode?: string; requiresApproval?: boolean }>>({
      method: "GET",
      url: `/v1/invitations/${code}`,
    });
  },
  getJoinStatus(code:string) {
    return request<ApiResponse<{status:string;family?:Family;member?:FamilyMember}>>({method:'GET',url:`/v1/invitations/${code}/status`});
  },

  acceptInvitation(code: string, body: { displayName: string; userId: string; wechatOpenId?: string }) {
    return request<ApiResponse<JoinResult>>({
      method: "POST",
      url: `/v1/invitations/${code}/accept`,
      data: body,
    });
  },

  listReminders(familyId: string) {
    return listAll<Reminder>(`/v1/families/${familyId}/reminders`);
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
    return listAll<LedgerEntry>(`/v1/families/${familyId}/ledger-entries`);
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
    return listAll<LedgerGoalFund>(`/v1/families/${familyId}/ledger-goal-funds`);
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
    return listAll<DigitalSpaceItem>(`/v1/families/${familyId}/digital-space-items`);
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
    return listAll<Activity>(`/v1/families/${familyId}/activities`);
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
    body: { actorMemberId: string; status: ActivityTaskStatus; version: number },
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
    body: { actorMemberId: string; status: "completed" | "cancelled"; version: number },
  ) {
    return request<ApiResponse<Activity>>({
      method: "PUT",
      url: `/v1/families/${familyId}/activities/${activityId}/status`,
      data: body,
    });
  },
  saveActivityMemory(familyId: string, activityId: string) {
    return request<ApiResponse<DigitalSpaceItem>>({ method: "POST", url: `/v1/families/${familyId}/activities/${activityId}/save-memory` });
  },
  subscribeReminder(familyId: string, reminderId: string, body: { templateId: string; subscriptionStatus: ReminderNotification["subscriptionStatus"] }) {
    return request<ApiResponse<Reminder>>({ method: "POST", url: `/v1/families/${familyId}/reminders/${reminderId}/subscription`, data: body });
  },
  getDashboard(familyId: string) {
    return request<ApiResponse<FamilyDashboard>>({ method: 'GET', url: `/v1/families/${familyId}/dashboard` });
  },
  listJoinRequests(familyId: string) {
    return request<ApiResponse<JoinRequest[]>>({ method: 'GET', url: `/v1/families/${familyId}/join-requests` });
  },
  decideJoinRequest(familyId: string, id: string, decision: 'approved'|'rejected') {
    return request<ApiResponse<{id: string; status: string}>>({ method:'POST', url:`/v1/families/${familyId}/join-requests/${id}/decision`, data:{decision} });
  },
  archiveFamily(familyId: string, version: number) {
    return request<ApiResponse<{archived: boolean}>>({ method:'POST', url:`/v1/families/${familyId}/archive`, data:{version} });
  },
  renameFamily(familyId:string,name:string,version:number){return request<ApiResponse<Family>>({method:'PUT',url:`/v1/families/${familyId}`,data:{name,version}});},
  getActivityEntry(id: string, code?: string) {
    return request<ApiResponse<{access:'member'|'invitation';familyId:string;family?:Family;member?:FamilyMember;title?:string;startsAt?:string}>>({method:'GET',url:`/v1/activities/${id}/entry${code?`?code=${encodeURIComponent(code)}`:''}`});
  },
  updateActivity(familyId: string, id: string, body:{version:number;title:string;startsAt:string;location?:string;description?:string}) {
    return request<ApiResponse<Activity>>({method:'PUT',url:`/v1/families/${familyId}/activities/${id}`,data:body});
  },
  getReminderPlan(familyId: string, id: string) {
    return request<ApiResponse<ReminderPlan>>({method:'GET',url:`/v1/families/${familyId}/reminder-plans/${id}`});
  },
  updateReminderPlan(familyId: string, id: string, body:ReminderPlan) {
    return request<ApiResponse<{id:string;version:number}>>({method:'PUT',url:`/v1/families/${familyId}/reminder-plans/${id}`,data:body});
  },
  pauseReminderPlan(familyId: string, id: string, version:number) {
    return request<ApiResponse<{id:string;version:number}>>({method:'POST',url:`/v1/families/${familyId}/reminder-plans/${id}/pause`,data:{version}});
  },
  updateLedgerEntry(familyId:string,id:string,body:Omit<LedgerEntry,'id'|'familyId'>) {
    return request<ApiResponse<LedgerEntry>>({method:'PUT',url:`/v1/families/${familyId}/ledger-entries/${id}`,data:body});
  },
  voidLedgerEntry(familyId:string,id:string,version:number) {
    return request<ApiResponse<{id:string}>>({method:'DELETE',url:`/v1/families/${familyId}/ledger-entries/${id}`,data:{version}});
  },
  logout() { return request<ApiResponse<{ok:boolean}>>({method:'POST',url:'/v1/wechat/logout'}); },
};
