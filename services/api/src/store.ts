import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  Activity,
  ActivityParticipant,
  ActivityStatus,
  ActivityTask,
  ActivityTaskStatus,
  AuditEvent,
  DigitalSpaceItem,
  DigitalSpaceItemKind,
  DigitalSpaceMediaItem,
  Family,
  FamilyInvitation,
  FamilyMember,
  FamilyRole,
  LedgerCategory,
  LedgerCategoryTotal,
  LedgerEntry,
  LedgerEntryType,
  LedgerGoalFund,
  LedgerMemberSplit,
  LedgerMonthlySummary,
  LedgerRecurrence,
  Reminder,
  ReminderFrequency,
  ReminderNotification,
  ReminderPlan,
  ReminderSchedule,
  ReminderTargetScope,
  ReminderType,
  RsvpStatus,
  User,
} from "@nestful/shared";

export interface CreateFamilyInput {
  name: string;
  ownerUserId: string;
  ownerDisplayName: string;
  ownerWechatOpenId?: string;
}

export interface CreateMemberInput {
  displayName: string;
  role?: FamilyRole;
  userId?: string;
  birthday?: string;
  birthdayCalendar?: "solar" | "lunar";
  location?: string;
  emergencyContact?: string;
  wechatOpenId?: string;
}

export interface UpdateMemberInput {
  displayName?: string;
  role?: FamilyRole;
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

export interface CreateReminderInput {
  type: ReminderType;
  title: string;
  dueAt: string;
  createdByMemberId: string;
  assigneeMemberId?: string;
  targetScope?: ReminderTargetScope;
  targetMemberIds?: string[];
  frequency?: ReminderFrequency;
  schedule?: ReminderSchedule;
  notificationSubscription?: ReminderNotificationSubscriptionInput;
}

export interface ReminderNotificationSubscriptionInput {
  templateId: string;
  recipientMemberId: string;
  subscriptionStatus: ReminderNotification["subscriptionStatus"];
}

export interface ReminderNotificationSendInput {
  reminder: Reminder;
  recipientOpenId: string;
  templateId: string;
}

export interface ReminderNotificationSendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface ReminderDispatchSummary {
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  notConfigured: number;
}

export interface CreateLedgerEntryInput {
  type: LedgerEntryType;
  category: LedgerCategory;
  title: string;
  amountCents: number;
  paidByMemberId: string;
  splitMemberIds?: string[];
  occurredAt: string;
  recurrence?: LedgerRecurrence;
}

export interface CreateLedgerGoalFundInput {
  title: string;
  targetAmountCents: number;
  currentAmountCents?: number;
  createdByMemberId: string;
  dueAt?: string;
}

export interface CreateDigitalSpaceItemInput {
  kind: DigitalSpaceItemKind;
  title: string;
  createdByMemberId: string;
  summary?: string;
  url?: string;
  occurredAt?: string;
  activityId?: string;
  place?: string;
  taggedMemberIds?: string[];
  mediaItems?: Array<Omit<DigitalSpaceMediaItem, "id" | "createdAt">>;
}

export interface CreateActivityInput {
  title: string;
  startsAt: string;
  createdByMemberId: string;
  status?: ActivityStatus;
  location?: string;
  description?: string;
  budgetCents?: number;
  participantMemberIds?: string[];
  tasks?: ActivityTaskInput[];
}

export interface ActivityTaskInput {
  title: string;
  assigneeMemberId?: string;
}

export interface UpdateActivityRsvpInput {
  actorMemberId: string;
  memberId: string;
  rsvp: RsvpStatus;
}

export interface CreateActivityTaskInput {
  actorMemberId: string;
  title: string;
  assigneeMemberId?: string;
}

export interface UpdateActivityTaskInput {
  actorMemberId: string;
  status: ActivityTaskStatus;
}

export interface UpdateActivityStatusInput {
  actorMemberId: string;
  status: Extract<ActivityStatus, "completed" | "cancelled">;
}

export interface CreateUserSessionInput {
  userId: string;
  wechatOpenId?: string;
  nickname?: string;
}

export interface UserSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

interface StoreState {
  users: User[];
  userSessions: UserSession[];
  families: Family[];
  members: FamilyMember[];
  invitations: FamilyInvitation[];
  reminderPlans: ReminderPlan[];
  reminders: Reminder[];
  activities: Activity[];
  activityParticipants: ActivityParticipant[];
  activityTasks: ActivityTask[];
  ledgerEntries: LedgerEntry[];
  ledgerGoalFunds: LedgerGoalFund[];
  digitalSpaceItems: DigitalSpaceItem[];
  auditEvents: AuditEvent[];
}

const defaultState = (): StoreState => ({
  users: [],
  userSessions: [],
  families: [],
  members: [],
  invitations: [],
  reminderPlans: [],
  reminders: [],
  activities: [],
  activityParticipants: [],
  activityTasks: [],
  ledgerEntries: [],
  ledgerGoalFunds: [],
  digitalSpaceItems: [],
  auditEvents: [],
});

const envString = (value: string | undefined) => {
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const defaultDataFile = process.env.VERCEL ? "/tmp/nestful.json" : ".data/nestful.json";
const dataFile = resolve(envString(process.env.DATA_FILE) ?? defaultDataFile);
const postgresConnectionString = envString(process.env.DATABASE_URL);
const storageDriver = envString(process.env.NESTFUL_STORAGE) ?? (postgresConnectionString ? "postgres" : "file");
const usePostgresStorage = storageDriver === "postgres" && Boolean(postgresConnectionString);
const postgresSsl =
  process.env.PGSSL === "disable" || postgresConnectionString?.includes("localhost")
    ? false
    : { rejectUnauthorized: false };
const pool = usePostgresStorage
  ? new Pool({
      connectionString: postgresConnectionString,
      ssl: postgresSsl,
    })
  : undefined;

const now = () => new Date().toISOString();

const createCode = () => randomUUID().replaceAll("-", "").slice(0, 10);
const createSessionToken = () => randomBytes(32).toString("base64url");
const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const invitationTtlMs = 24 * 60 * 60 * 1000;
const reminderNotificationRetryDelayMs = 60 * 1000;
const reminderNotificationMaxAttempts = 3;

const reminderFrequenciesWithNextOccurrence: ReminderFrequency[] = [
  "daily_once",
  "daily_twice",
  "daily_three_times",
  "weekly",
  "monthly",
  "yearly",
];

const isRecurringReminderFrequency = (frequency: ReminderFrequency | undefined) =>
  Boolean(frequency && reminderFrequenciesWithNextOccurrence.includes(frequency));

const parseTimeOfDay = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return undefined;
  }

  return {
    text: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
    minutes: hours * 60 + minutes,
  };
};

const scheduleTimesOfDay = (schedule: ReminderSchedule | undefined) => {
  const times = (schedule?.timesOfDay ?? [])
    .map(parseTimeOfDay)
    .filter((time): time is { text: string; minutes: number } => Boolean(time))
    .sort((left, right) => left.minutes - right.minutes);

  return times.filter((time, index) => index === 0 || time.text !== times[index - 1]?.text);
};

const setLocalTimeOfDay = (date: Date, minutesFromMidnight: number) => {
  const next = new Date(date);
  next.setHours(Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60, 0, 0);

  return next;
};

const advanceDailyDueAt = (dueAt: Date, schedule: ReminderSchedule | undefined) => {
  const times = scheduleTimesOfDay(schedule);

  if (times.length === 0) {
    const next = new Date(dueAt);
    next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  const currentMinutes = dueAt.getHours() * 60 + dueAt.getMinutes();
  const nextToday = times.find((time) => time.minutes > currentMinutes);

  if (nextToday) {
    return setLocalTimeOfDay(dueAt, nextToday.minutes).toISOString();
  }

  const nextDay = new Date(dueAt);
  nextDay.setDate(nextDay.getDate() + 1);

  return setLocalTimeOfDay(nextDay, times[0].minutes).toISOString();
};

const advanceReminderDueAt = (reminder: Reminder) => {
  const frequency = reminder.frequency ?? "once";

  if (!isRecurringReminderFrequency(frequency)) {
    return undefined;
  }

  const dueAt = new Date(reminder.dueAt);

  if (Number.isNaN(dueAt.getTime())) {
    return undefined;
  }

  if (frequency === "weekly") {
    dueAt.setDate(dueAt.getDate() + 7);
    return dueAt.toISOString();
  }

  if (frequency === "monthly") {
    dueAt.setMonth(dueAt.getMonth() + 1);
    return dueAt.toISOString();
  }

  if (frequency === "yearly") {
    dueAt.setFullYear(dueAt.getFullYear() + 1);
    return dueAt.toISOString();
  }

  return advanceDailyDueAt(dueAt, reminder.schedule);
};

const createReminderNotificationDispatchKey = (reminder: Reminder) =>
  `${reminder.id}:${reminder.notification?.templateId ?? "no-template"}:${reminder.dueAt}`;

const assignReminderNotificationDispatchKey = (reminder: Reminder) => {
  if (reminder.notification) {
    reminder.notification.dispatchKey = reminder.notification.dispatchKey ?? createReminderNotificationDispatchKey(reminder);
  }
};

const createReminderNotification = (
  input: ReminderNotificationSubscriptionInput | undefined,
  recipientMember: FamilyMember | undefined,
  requestedAt: string,
): ReminderNotification | undefined => {
  if (!input || !recipientMember) {
    return undefined;
  }

  const accepted = input.subscriptionStatus === "accept";
  const hasRecipientOpenId = Boolean(recipientMember.wechatOpenId);

  return {
    templateId: input.templateId,
    recipientMemberId: input.recipientMemberId,
    recipientOpenId: recipientMember.wechatOpenId,
    subscriptionStatus: input.subscriptionStatus,
    sendStatus: accepted && hasRecipientOpenId ? "pending" : "skipped",
    requestedAt,
    attemptCount: 0,
    lastError: accepted && !hasRecipientOpenId ? "missing_recipient_openid" : accepted ? undefined : "subscription_not_accepted",
  };
};

const createNextOccurrenceNotification = (
  notification: ReminderNotification | undefined,
  requestedAt: string,
): ReminderNotification | undefined => {
  if (!notification) {
    return undefined;
  }

  return {
    templateId: notification.templateId,
    recipientMemberId: notification.recipientMemberId,
    recipientOpenId: notification.recipientOpenId,
    subscriptionStatus: notification.subscriptionStatus,
    sendStatus: "skipped",
    requestedAt,
    attemptCount: 0,
    lastError:
      notification.subscriptionStatus === "accept"
        ? "subscription_reauthorization_required"
        : "subscription_not_accepted",
  };
};

const reminderPlanFromInput = (familyId: string, input: CreateReminderInput, createdAt: string): ReminderPlan => ({
  id: randomUUID(),
  familyId,
  type: input.type,
  title: input.title,
  assigneeMemberId: input.assigneeMemberId,
  targetScope: input.targetScope,
  targetMemberIds: input.targetMemberIds,
  frequency: input.frequency ?? "once",
  schedule: input.schedule,
  createdByMemberId: input.createdByMemberId,
  enabled: true,
  createdAt,
  nextDueAt: input.dueAt,
  completedCount: 0,
});

const reminderPlanFromReminder = (reminder: Reminder): ReminderPlan => ({
  id: reminder.planId ?? randomUUID(),
  familyId: reminder.familyId,
  type: reminder.type,
  title: reminder.title,
  assigneeMemberId: reminder.assigneeMemberId,
  targetScope: reminder.targetScope,
  targetMemberIds: reminder.targetMemberIds,
  frequency: reminder.frequency ?? "once",
  schedule: reminder.schedule,
  createdByMemberId: reminder.createdByMemberId,
  enabled: reminder.enabled,
  createdAt: reminder.completedAt ?? now(),
  nextDueAt: reminder.completedAt ? undefined : reminder.dueAt,
  lastCompletedAt: reminder.completedAt,
  completedCount: reminder.completedAt ? 1 : 0,
});

const uniqueStrings = (items: Array<string | undefined>) => Array.from(new Set(items.filter(Boolean) as string[]));

const activityStatusLabel = (status: ActivityStatus) => {
  const labels: Record<ActivityStatus, string> = {
    draft: "草稿",
    scheduled: "已安排",
    completed: "已完成",
    cancelled: "已取消",
  };

  return labels[status];
};

const rsvpSummaryText = (participants: ActivityParticipant[]) => {
  const accepted = participants.filter((participant) => participant.rsvp === "accepted").length;
  const tentative = participants.filter((participant) => participant.rsvp === "tentative").length;
  const declined = participants.filter((participant) => participant.rsvp === "declined").length;
  const pending = participants.filter((participant) => participant.rsvp === "pending").length;

  return `确认 ${accepted} 人，待定 ${tentative} 人，未定 ${pending} 人，无法参加 ${declined} 人`;
};

const activityTaskSummaryText = (tasks: ActivityTask[]) => {
  if (tasks.length === 0) {
    return "协作任务：暂无";
  }

  const done = tasks.filter((task) => task.status === "done").length;

  return `协作任务：${done}/${tasks.length} 已完成`;
};

const activitySharePath = (activity: Activity) => `/pages/activities/index?activityId=${activity.id}`;

const activityShareText = (activity: Activity, participants: ActivityParticipant[], tasks: ActivityTask[]) => {
  const location = activity.location ? `地点：${activity.location}` : "地点：待定";

  return [
    `家庭活动：${activity.title}`,
    `时间：${activity.startsAt}`,
    location,
    `状态：${activityStatusLabel(activity.status)}`,
    rsvpSummaryText(participants),
    activityTaskSummaryText(tasks),
    activity.status === "completed" ? "这次活动已沉淀到家庭记忆。" : "打开家庭助手一起确认。",
  ].join("\n");
};

const activityWithDetails = (activity: Activity): Activity => {
  const participants = state.activityParticipants.filter((participant) => participant.activityId === activity.id);
  const tasks = state.activityTasks.filter((task) => task.activityId === activity.id);

  return {
    ...activity,
    participants,
    tasks,
    sharePath: activitySharePath(activity),
    shareText: activityShareText(activity, participants, tasks),
  };
};

const accountSecurityWarning =
  "账号说明只能记录用途、归属和找回线索，不要保存密码、验证码、密保答案或恢复密钥。";

const digitalSpaceItemWithMetadata = (item: DigitalSpaceItem): DigitalSpaceItem => ({
  ...item,
  securityWarning: item.kind === "account" ? (item.securityWarning ?? accountSecurityWarning) : item.securityWarning,
  mediaItems: item.mediaItems ?? [],
  taggedMemberIds: item.taggedMemberIds ?? [],
});

const digitalSpaceSortTime = (item: DigitalSpaceItem) => Date.parse(item.occurredAt ?? item.createdAt);

const ledgerMonthFromDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const currentLedgerMonth = () => ledgerMonthFromDate(now()) ?? new Date().toISOString().slice(0, 7);

const nextLedgerReminderDueAt = (occurredAt: string, recurrence: LedgerRecurrence) => {
  const dueAt = new Date(occurredAt);

  if (Number.isNaN(dueAt.getTime())) {
    return occurredAt;
  }

  if (recurrence === "monthly") {
    dueAt.setMonth(dueAt.getMonth() + 1);
  } else {
    dueAt.setFullYear(dueAt.getFullYear() + 1);
  }

  return dueAt.toISOString();
};

const ledgerRecurrenceLabel = (recurrence: LedgerRecurrence) => (recurrence === "monthly" ? "每月续费" : "每年续费");

const createLedgerReminder = (
  familyId: string,
  entry: LedgerEntry,
  recurrence: LedgerRecurrence,
  createdAt: string,
) => {
  const reminderInput: CreateReminderInput = {
    type: "bill",
    title: `${entry.title}续费`,
    dueAt: nextLedgerReminderDueAt(entry.occurredAt, recurrence),
    createdByMemberId: entry.paidByMemberId,
    assigneeMemberId: entry.paidByMemberId,
    targetScope: "family",
    targetMemberIds: entry.splitMemberIds,
    frequency: recurrence,
    schedule: {
      targetLabel: entry.title,
      frequencyLabel: ledgerRecurrenceLabel(recurrence),
    },
  };
  const plan = reminderPlanFromInput(familyId, reminderInput, createdAt);
  const reminder: Reminder = {
    id: randomUUID(),
    planId: plan.id,
    familyId,
    type: reminderInput.type,
    title: reminderInput.title,
    dueAt: reminderInput.dueAt,
    occurrenceNumber: 1,
    occurrenceStatus: "pending",
    assigneeMemberId: reminderInput.assigneeMemberId,
    targetScope: reminderInput.targetScope,
    targetMemberIds: reminderInput.targetMemberIds,
    frequency: plan.frequency,
    schedule: reminderInput.schedule,
    createdByMemberId: reminderInput.createdByMemberId,
    enabled: true,
  };

  state.reminderPlans.push(plan);
  state.reminders.push(reminder);
  audit({
    familyId,
    actorMemberId: entry.paidByMemberId,
    action: "reminder.plan.created",
    resourceType: "reminder_plan",
    resourceId: plan.id,
  });
  audit({
    familyId,
    actorMemberId: entry.paidByMemberId,
    action: "reminder.occurrence.created",
    resourceType: "reminder",
    resourceId: reminder.id,
  });
  audit({
    familyId,
    actorMemberId: entry.paidByMemberId,
    action: "ledger_entry.recurring_reminder_created",
    resourceType: "reminder",
    resourceId: reminder.id,
  });

  return reminder;
};

const splitLedgerAmount = (amountCents: number, memberIds: string[]) => {
  const splitMemberIds = memberIds.length > 0 ? memberIds : [];
  const baseShare = Math.floor(amountCents / Math.max(splitMemberIds.length, 1));
  let remainder = amountCents - baseShare * splitMemberIds.length;

  return splitMemberIds.map((memberId) => {
    const extraCent = remainder > 0 ? 1 : 0;
    remainder -= extraCent;

    return {
      memberId,
      amountCents: baseShare + extraCent,
    };
  });
};

const ledgerSummaryForMonth = (familyId: string, month: string): LedgerMonthlySummary => {
  const entries = state.ledgerEntries.filter(
    (entry) => entry.familyId === familyId && ledgerMonthFromDate(entry.occurredAt) === month,
  );
  const categoryTotals = new Map<LedgerCategory, LedgerCategoryTotal>();
  const memberSplits = new Map<string, LedgerMemberSplit>();
  let incomeCents = 0;
  let expenseCents = 0;

  const memberSplitFor = (memberId: string) => {
    const existing = memberSplits.get(memberId);

    if (existing) {
      return existing;
    }

    const next: LedgerMemberSplit = {
      memberId,
      paidCents: 0,
      owedCents: 0,
      balanceCents: 0,
      entryCount: 0,
    };
    memberSplits.set(memberId, next);

    return next;
  };

  for (const entry of entries) {
    if (entry.type === "income") {
      incomeCents += entry.amountCents;
      continue;
    }

    expenseCents += entry.amountCents;
    const categoryTotal = categoryTotals.get(entry.category) ?? {
      category: entry.category,
      amountCents: 0,
      entryCount: 0,
    };
    categoryTotal.amountCents += entry.amountCents;
    categoryTotal.entryCount += 1;
    categoryTotals.set(entry.category, categoryTotal);

    const paidBy = memberSplitFor(entry.paidByMemberId);
    paidBy.paidCents += entry.amountCents;
    paidBy.entryCount += 1;

    for (const split of splitLedgerAmount(entry.amountCents, entry.splitMemberIds)) {
      const memberSplit = memberSplitFor(split.memberId);
      memberSplit.owedCents += split.amountCents;
      memberSplit.entryCount += memberSplit.memberId === entry.paidByMemberId ? 0 : 1;
    }
  }

  const memberSplitItems = Array.from(memberSplits.values())
    .map((item) => ({
      ...item,
      balanceCents: item.paidCents - item.owedCents,
    }))
    .sort((left, right) => right.paidCents + right.owedCents - (left.paidCents + left.owedCents));

  return {
    familyId,
    month,
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    entryCount: entries.length,
    categoryTotals: Array.from(categoryTotals.values()).sort((left, right) => right.amountCents - left.amountCents),
    memberSplits: memberSplitItems,
    goalFunds: state.ledgerGoalFunds
      .filter((goal) => goal.familyId === familyId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
  };
};

const normalizeState = (parsed: Partial<StoreState> | undefined): StoreState => ({
  ...defaultState(),
  ...(parsed ?? {}),
  users: parsed?.users ?? [],
  userSessions: parsed?.userSessions ?? [],
  families: parsed?.families ?? [],
  members: parsed?.members ?? [],
  invitations: parsed?.invitations ?? [],
  reminderPlans: (parsed?.reminderPlans ?? []).map((plan) => ({
    ...plan,
    frequency: plan.frequency ?? "once",
    enabled: plan.enabled ?? true,
    completedCount: plan.completedCount ?? 0,
  })),
  reminders: (parsed?.reminders ?? []).map((reminder) => ({
    ...reminder,
    occurrenceStatus: reminder.occurrenceStatus ?? (reminder.completedAt ? "completed" : "pending"),
  })),
  activities: parsed?.activities ?? [],
  activityParticipants: parsed?.activityParticipants ?? [],
  activityTasks: (parsed?.activityTasks ?? []).map((task) => ({
    ...task,
    status: task.status ?? "open",
  })),
  ledgerEntries: (parsed?.ledgerEntries ?? []).map((entry) => ({
    ...entry,
    splitMemberIds: entry.splitMemberIds?.length ? entry.splitMemberIds : [entry.paidByMemberId],
  })),
  ledgerGoalFunds: parsed?.ledgerGoalFunds ?? [],
  digitalSpaceItems: parsed?.digitalSpaceItems ?? [],
  auditEvents: parsed?.auditEvents ?? [],
});

const readFileState = (): StoreState => {
  try {
    const parsed = JSON.parse(readFileSync(dataFile, "utf8")) as Partial<StoreState>;

    return normalizeState(parsed);
  } catch (error) {
    return defaultState();
  }
};

let state = usePostgresStorage ? defaultState() : readFileState();
let postgresSchemaReady: Promise<void> | undefined;

const ensurePostgresSchema = async () => {
  if (!pool) {
    return;
  }

  postgresSchemaReady ??= (async () => {
    await pool.query(`
      create table if not exists nestful_app_state (
        id text primary key,
        data jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    await pool.query(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'nestful_app_state_data_object'
        ) then
          alter table nestful_app_state
          add constraint nestful_app_state_data_object
          check (jsonb_typeof(data) = 'object');
        end if;
      end
      $$;
    `);
    await pool.query(`
      create index if not exists nestful_app_state_updated_at_idx
      on nestful_app_state(updated_at)
    `);
    await pool.query(
      `
        insert into nestful_app_state (id, data)
        values ($1, $2::jsonb)
        on conflict (id) do nothing
      `,
      ["default", JSON.stringify(defaultState())],
    );
  })();

  await postgresSchemaReady;
};

const readPostgresState = async (): Promise<StoreState> => {
  if (!pool) {
    return state;
  }

  if (!postgresConnectionString) {
    throw new Error("DATABASE_URL is required when NESTFUL_STORAGE=postgres");
  }

  await ensurePostgresSchema();
  const result = await pool.query<{ data: StoreState }>("select data from nestful_app_state where id = $1", ["default"]);

  return normalizeState(result.rows[0]?.data);
};

const loadState = async () => {
  if (pool) {
    state = await readPostgresState();
  }
};

const persistFile = () => {
  mkdirSync(dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.${process.pid}.tmp`;

  writeFileSync(tempFile, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tempFile, dataFile);
};

const persistPostgres = async () => {
  if (!pool) {
    return;
  }

  await ensurePostgresSchema();
  await pool.query(
    `
      insert into nestful_app_state (id, data, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id)
      do update set data = excluded.data, updated_at = now()
    `,
    ["default", JSON.stringify(state)],
  );
};

const persist = async () => {
  if (pool) {
    await persistPostgres();
    return;
  }

  persistFile();
};

const audit = (event: Omit<AuditEvent, "id" | "createdAt">) => {
  state.auditEvents.push({
    id: randomUUID(),
    createdAt: now(),
    ...event,
  });
};

export const familyStore = {
  async createUserSession(input: CreateUserSessionInput) {
    await loadState();
    const createdAt = now();
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    let user = state.users.find((item) => item.id === input.userId);

    if (!user) {
      user = {
        id: input.userId,
        wechatOpenId: input.wechatOpenId,
        nickname: input.nickname ?? "微信用户",
        createdAt,
      };
      state.users.push(user);
    } else {
      user.wechatOpenId = input.wechatOpenId ?? user.wechatOpenId;
      user.nickname = input.nickname ?? user.nickname;
    }

    state.userSessions = state.userSessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
    state.userSessions.push({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashSessionToken(token),
      createdAt,
      expiresAt,
    });
    await persist();

    return { token, expiresAt, user };
  },

  async getUserSession(token: string | undefined) {
    if (!token) {
      return undefined;
    }

    await loadState();
    const tokenHash = hashSessionToken(token);
    const session = state.userSessions.find((item) => item.tokenHash === tokenHash);

    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      return undefined;
    }

    return {
      session,
      user: state.users.find((user) => user.id === session.userId),
    };
  },

  async listFamilies() {
    await loadState();
    return state.families;
  },

  async getFamily(familyId: string) {
    await loadState();
    return state.families.find((family) => family.id === familyId);
  },

  async createFamily(input: CreateFamilyInput) {
    await loadState();
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
      wechatOpenId: input.ownerWechatOpenId,
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
    await persist();

    return { family, ownerMember };
  },

  async listMembers(familyId: string) {
    await loadState();
    return state.members.filter((member) => member.familyId === familyId);
  },

  async getMember(memberId: string) {
    await loadState();
    return state.members.find((member) => member.id === memberId);
  },

  async createMember(familyId: string, input: CreateMemberInput, actorMemberId?: string) {
    await loadState();
    const member: FamilyMember = {
      id: randomUUID(),
      familyId,
      userId: input.userId,
      wechatOpenId: input.wechatOpenId,
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
    await persist();

    return member;
  },

  async updateMember(memberId: string, input: UpdateMemberInput, actorMemberId: string) {
    await loadState();
    const member = state.members.find((item) => item.id === memberId);

    if (!member) {
      return undefined;
    }

    if ("displayName" in input && input.displayName) {
      member.displayName = input.displayName;
    }
    if ("role" in input && input.role) {
      member.role = input.role;
    }
    if ("birthday" in input) {
      member.birthday = input.birthday;
    }
    if ("birthdayCalendar" in input) {
      member.birthdayCalendar = input.birthdayCalendar;
    }
    if ("location" in input) {
      member.location = input.location;
    }
    if ("emergencyContact" in input) {
      member.emergencyContact = input.emergencyContact;
    }
    audit({
      familyId: member.familyId,
      actorMemberId,
      action: "member.updated",
      resourceType: "member",
      resourceId: member.id,
    });
    await persist();

    return member;
  },

  async removeMember(memberId: string, actorMemberId: string) {
    await loadState();
    const member = state.members.find((item) => item.id === memberId);

    if (!member) {
      return undefined;
    }

    state.members = state.members.filter((item) => item.id !== memberId);
    audit({
      familyId: member.familyId,
      actorMemberId,
      action: "member.removed",
      resourceType: "member",
      resourceId: member.id,
    });
    await persist();

    return member;
  },

  async createInvitation(familyId: string, input: CreateInvitationInput) {
    await loadState();
    const invitation: FamilyInvitation = {
      id: randomUUID(),
      familyId,
      code: createCode(),
      role: input.role ?? "member",
      createdByMemberId: input.createdByMemberId,
      createdAt: now(),
      expiresAt: input.expiresAt ?? new Date(Date.now() + invitationTtlMs).toISOString(),
    };

    state.invitations.push(invitation);
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "invitation.created",
      resourceType: "invitation",
      resourceId: invitation.id,
    });
    await persist();

    return invitation;
  },

  async listInvitations(familyId: string) {
    await loadState();
    return state.invitations.filter((invitation) => invitation.familyId === familyId);
  },

  async getInvitation(invitationId: string) {
    await loadState();
    return state.invitations.find((invitation) => invitation.id === invitationId);
  },

  async cancelInvitation(invitationId: string, actorMemberId: string) {
    await loadState();
    const invitation = state.invitations.find((item) => item.id === invitationId);

    if (!invitation || invitation.acceptedAt || invitation.canceledAt) {
      return undefined;
    }

    invitation.canceledAt = now();
    audit({
      familyId: invitation.familyId,
      actorMemberId,
      action: "invitation.cancelled",
      resourceType: "invitation",
      resourceId: invitation.id,
    });
    await persist();

    return invitation;
  },

  async getInvitationByCode(code: string) {
    await loadState();
    return state.invitations.find((invitation) => invitation.code === code);
  },

  async acceptInvitation(code: string, input: CreateMemberInput) {
    await loadState();
    const invitation = state.invitations.find((item) => item.code === code);

    if (!invitation || invitation.acceptedAt || invitation.canceledAt) {
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

    const member: FamilyMember = {
      id: randomUUID(),
      familyId: invitation.familyId,
      userId: input.userId,
      wechatOpenId: input.wechatOpenId,
      displayName: input.displayName,
      role: invitation.role,
      birthday: input.birthday,
      birthdayCalendar: input.birthdayCalendar,
      location: input.location,
      emergencyContact: input.emergencyContact,
      joinedAt: now(),
    };

    state.members.push(member);
    audit({
      familyId: invitation.familyId,
      actorMemberId: invitation.createdByMemberId,
      action: "member.created",
      resourceType: "member",
      resourceId: member.id,
    });
    invitation.acceptedAt = now();
    invitation.acceptedByMemberId = member.id;
    audit({
      familyId: invitation.familyId,
      actorMemberId: member.id,
      action: "invitation.accepted",
      resourceType: "invitation",
      resourceId: invitation.id,
    });
    await persist();

    return { invitation, member };
  },

  async listReminders(familyId: string) {
    await loadState();
    return state.reminders.filter((reminder) => reminder.familyId === familyId);
  },

  async getReminder(reminderId: string) {
    await loadState();
    return state.reminders.find((reminder) => reminder.id === reminderId);
  },

  async createReminder(familyId: string, input: CreateReminderInput) {
    await loadState();
    const createdAt = now();
    const recipientMemberId = input.notificationSubscription?.recipientMemberId;
    const recipientMember = recipientMemberId ? state.members.find((member) => member.id === recipientMemberId) : undefined;
    const notification = createReminderNotification(input.notificationSubscription, recipientMember, createdAt);
    const plan = reminderPlanFromInput(familyId, input, createdAt);
    const reminder: Reminder = {
      id: randomUUID(),
      planId: plan.id,
      familyId,
      type: input.type,
      title: input.title,
      dueAt: input.dueAt,
      occurrenceNumber: 1,
      occurrenceStatus: "pending",
      assigneeMemberId: input.assigneeMemberId,
      targetScope: input.targetScope,
      targetMemberIds: input.targetMemberIds,
      frequency: plan.frequency,
      schedule: input.schedule,
      createdByMemberId: input.createdByMemberId,
      enabled: true,
      notification,
    };
    assignReminderNotificationDispatchKey(reminder);

    state.reminderPlans.push(plan);
    state.reminders.push(reminder);
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "reminder.plan.created",
      resourceType: "reminder_plan",
      resourceId: plan.id,
    });
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "reminder.occurrence.created",
      resourceType: "reminder",
      resourceId: reminder.id,
    });
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "reminder.created",
      resourceType: "reminder",
      resourceId: reminder.id,
    });
    await persist();

    return reminder;
  },

  async dispatchDueReminders(sendNotification: (input: ReminderNotificationSendInput) => Promise<ReminderNotificationSendResult>) {
    await loadState();
    const currentTime = Date.now();
    const dispatchKeys = new Set<string>();
    let changed = false;
    const summary: ReminderDispatchSummary = {
      due: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      notConfigured: 0,
    };

    for (const reminder of state.reminders) {
      const notification = reminder.notification;

      if (
        !reminder.enabled ||
        reminder.completedAt ||
        reminder.occurrenceStatus === "completed" ||
        !notification ||
        notification.sendStatus !== "pending" ||
        Date.parse(reminder.dueAt) > currentTime
      ) {
        continue;
      }

      summary.due += 1;
      notification.dispatchKey = notification.dispatchKey ?? createReminderNotificationDispatchKey(reminder);
      changed = true;

      if (dispatchKeys.has(notification.dispatchKey)) {
        notification.sendStatus = "skipped";
        notification.lastAttemptAt = now();
        notification.lastError = "duplicate_dispatch_key";
        summary.skipped += 1;
        continue;
      }

      dispatchKeys.add(notification.dispatchKey);

      if (
        notification.lastAttemptAt &&
        currentTime - Date.parse(notification.lastAttemptAt) < reminderNotificationRetryDelayMs
      ) {
        continue;
      }

      if (!notification.recipientOpenId || notification.subscriptionStatus !== "accept") {
        notification.sendStatus = "skipped";
        notification.lastAttemptAt = now();
        notification.lastError = !notification.recipientOpenId ? "missing_recipient_openid" : "subscription_not_accepted";
        summary.skipped += 1;
        continue;
      }

      const result = await sendNotification({
        reminder,
        recipientOpenId: notification.recipientOpenId,
        templateId: notification.templateId,
      });

      if (result.ok) {
        notification.sendStatus = "sent";
        notification.sentAt = now();
        notification.lastAttemptAt = notification.sentAt;
        notification.lastError = undefined;
        summary.sent += 1;
        audit({
          familyId: reminder.familyId,
          actorMemberId: notification.recipientMemberId,
          action: "reminder.notification.sent",
          resourceType: "reminder",
          resourceId: reminder.id,
        });
        continue;
      }

      if (result.skipped) {
        notification.lastAttemptAt = now();
        notification.lastError = result.error ?? "wechat_sender_not_configured";
        summary.notConfigured += 1;
        continue;
      }

      notification.attemptCount += 1;
      notification.lastAttemptAt = now();
      notification.lastError = result.error ?? "wechat_send_failed";
      notification.sendStatus = notification.attemptCount >= reminderNotificationMaxAttempts ? "failed" : "pending";
      summary.failed += 1;
    }

    if (changed || summary.sent > 0 || summary.failed > 0 || summary.skipped > 0 || summary.notConfigured > 0) {
      await persist();
    }

    return summary;
  },

  async completeReminder(reminderId: string, actorMemberId: string) {
    await loadState();
    const reminder = state.reminders.find((item) => item.id === reminderId);

    if (!reminder) {
      return undefined;
    }

    let changed = false;
    let plan = reminder.planId ? state.reminderPlans.find((item) => item.id === reminder.planId) : undefined;

    if (!plan) {
      plan = reminderPlanFromReminder(reminder);
      reminder.planId = plan.id;
      state.reminderPlans.push(plan);
      changed = true;
    }

    if (reminder.completedAt) {
      if (changed) {
        await persist();
      }

      return reminder;
    }

    const completedAt = now();
    reminder.completedAt = completedAt;
    reminder.completedByMemberId = actorMemberId;
    reminder.occurrenceStatus = "completed";
    plan.lastCompletedAt = completedAt;
    plan.completedCount += 1;
    changed = true;

    const nextDueAt = advanceReminderDueAt(reminder);

    if (nextDueAt && plan.enabled) {
      const existingNextOccurrence = state.reminders.find(
        (item) => item.planId === plan?.id && item.dueAt === nextDueAt && !item.completedAt,
      );

      plan.nextDueAt = existingNextOccurrence?.dueAt ?? nextDueAt;

      if (!existingNextOccurrence) {
        const nextOccurrenceNumber =
          Math.max(
            0,
            ...state.reminders
              .filter((item) => item.planId === plan?.id)
              .map((item) => item.occurrenceNumber ?? 0),
          ) + 1;
        const nextReminder: Reminder = {
          id: randomUUID(),
          planId: plan.id,
          familyId: plan.familyId,
          type: plan.type,
          title: plan.title,
          dueAt: nextDueAt,
          occurrenceNumber: nextOccurrenceNumber,
          occurrenceStatus: "pending",
          assigneeMemberId: plan.assigneeMemberId,
          targetScope: plan.targetScope,
          targetMemberIds: plan.targetMemberIds,
          frequency: plan.frequency,
          schedule: plan.schedule,
          createdByMemberId: plan.createdByMemberId,
          enabled: plan.enabled,
          notification: createNextOccurrenceNotification(reminder.notification, completedAt),
        };
        assignReminderNotificationDispatchKey(nextReminder);
        state.reminders.push(nextReminder);
        audit({
          familyId: nextReminder.familyId,
          actorMemberId,
          action: "reminder.occurrence.created",
          resourceType: "reminder",
          resourceId: nextReminder.id,
        });
      }
    } else {
      plan.nextDueAt = undefined;
    }

    audit({
      familyId: reminder.familyId,
      actorMemberId,
      action: "reminder.completed",
      resourceType: "reminder",
      resourceId: reminder.id,
    });
    if (changed) {
      await persist();
    }

    return reminder;
  },

  async listActivities(familyId: string) {
    await loadState();
    return state.activities.filter((activity) => activity.familyId === familyId).map(activityWithDetails);
  },

  async getActivity(activityId: string) {
    await loadState();
    const activity = state.activities.find((item) => item.id === activityId);

    return activity ? activityWithDetails(activity) : undefined;
  },

  async createActivity(familyId: string, input: CreateActivityInput) {
    await loadState();
    const participantMemberIds = uniqueStrings([input.createdByMemberId, ...(input.participantMemberIds ?? [])]);
    const activity: Activity = {
      id: randomUUID(),
      familyId,
      title: input.title,
      status: input.status ?? "scheduled",
      startsAt: input.startsAt,
      location: input.location,
      description: input.description,
      budgetCents: input.budgetCents,
      createdByMemberId: input.createdByMemberId,
    };
    const joinedAt = now();
    const participants: ActivityParticipant[] = participantMemberIds.map((memberId) => ({
      activityId: activity.id,
      memberId,
      rsvp: memberId === input.createdByMemberId ? "accepted" : "pending",
      joinedAt,
    }));
    const tasks: ActivityTask[] = (input.tasks ?? [])
      .filter((task) => task.title.trim().length > 0)
      .map((task) => ({
        id: randomUUID(),
        activityId: activity.id,
        familyId,
        title: task.title.trim(),
        assigneeMemberId: task.assigneeMemberId,
        status: "open",
        createdByMemberId: input.createdByMemberId,
      }));

    state.activities.push(activity);
    state.activityParticipants.push(...participants);
    state.activityTasks.push(...tasks);
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "activity.created",
      resourceType: "activity",
      resourceId: activity.id,
    });
    await persist();

    return activityWithDetails(activity);
  },

  async updateActivityRsvp(activityId: string, input: UpdateActivityRsvpInput) {
    await loadState();
    const activity = state.activities.find((item) => item.id === activityId);

    if (!activity) {
      return undefined;
    }

    let participant = state.activityParticipants.find(
      (item) => item.activityId === activityId && item.memberId === input.memberId,
    );

    if (!participant) {
      participant = {
        activityId,
        memberId: input.memberId,
        rsvp: input.rsvp,
        joinedAt: now(),
      };
      state.activityParticipants.push(participant);
    } else {
      participant.rsvp = input.rsvp;
    }

    audit({
      familyId: activity.familyId,
      actorMemberId: input.actorMemberId,
      action: "activity.rsvp.updated",
      resourceType: "activity",
      resourceId: activity.id,
    });
    await persist();

    return activityWithDetails(activity);
  },

  async createActivityTask(activityId: string, input: CreateActivityTaskInput) {
    await loadState();
    const activity = state.activities.find((item) => item.id === activityId);

    if (!activity) {
      return undefined;
    }

    const task: ActivityTask = {
      id: randomUUID(),
      activityId,
      familyId: activity.familyId,
      title: input.title,
      assigneeMemberId: input.assigneeMemberId,
      status: "open",
      createdByMemberId: input.actorMemberId,
    };

    state.activityTasks.push(task);
    audit({
      familyId: activity.familyId,
      actorMemberId: input.actorMemberId,
      action: "activity.task.created",
      resourceType: "activity_task",
      resourceId: task.id,
    });
    await persist();

    return activityWithDetails(activity);
  },

  async updateActivityTask(activityId: string, taskId: string, input: UpdateActivityTaskInput) {
    await loadState();
    const activity = state.activities.find((item) => item.id === activityId);
    const task = state.activityTasks.find((item) => item.id === taskId && item.activityId === activityId);

    if (!activity || !task) {
      return undefined;
    }

    task.status = input.status;
    task.completedAt = input.status === "done" ? task.completedAt ?? now() : undefined;
    audit({
      familyId: activity.familyId,
      actorMemberId: input.actorMemberId,
      action: "activity.task.updated",
      resourceType: "activity_task",
      resourceId: task.id,
    });
    await persist();

    return activityWithDetails(activity);
  },

  async updateActivityStatus(activityId: string, input: UpdateActivityStatusInput) {
    await loadState();
    const activity = state.activities.find((item) => item.id === activityId);

    if (!activity) {
      return undefined;
    }

    if (input.status === "completed") {
      activity.status = "completed";
      activity.completedAt = activity.completedAt ?? now();

      if (!activity.memoryItemId) {
        const taggedMemberIds = uniqueStrings(
          state.activityParticipants
            .filter((participant) => participant.activityId === activity.id)
            .map((participant) => participant.memberId),
        );
        const memoryItem: DigitalSpaceItem = {
          id: randomUUID(),
          familyId: activity.familyId,
          kind: "memory",
          title: `${activity.title}的家庭记忆`,
          summary: activity.description ?? "一次已经完成的家庭活动",
          occurredAt: activity.startsAt,
          createdByMemberId: input.actorMemberId,
          activityId: activity.id,
          place: activity.location,
          taggedMemberIds,
          mediaItems: [],
          createdAt: now(),
        };

        state.digitalSpaceItems.push(memoryItem);
        activity.memoryItemId = memoryItem.id;
        audit({
          familyId: activity.familyId,
          actorMemberId: input.actorMemberId,
          action: "activity.memory.created",
          resourceType: "digital_space_item",
          resourceId: memoryItem.id,
        });
      }
    } else {
      activity.status = "cancelled";
      activity.cancelledAt = activity.cancelledAt ?? now();
    }

    audit({
      familyId: activity.familyId,
      actorMemberId: input.actorMemberId,
      action: `activity.${input.status}`,
      resourceType: "activity",
      resourceId: activity.id,
    });
    await persist();

    return activityWithDetails(activity);
  },

  async listLedgerEntries(familyId: string) {
    await loadState();
    return state.ledgerEntries
      .filter((entry) => entry.familyId === familyId)
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  },

  async createLedgerEntry(familyId: string, input: CreateLedgerEntryInput) {
    await loadState();
    const createdAt = now();
    const splitMemberIds = uniqueStrings([...(input.splitMemberIds ?? []), input.paidByMemberId]);
    const entry: LedgerEntry = {
      id: randomUUID(),
      familyId,
      type: input.type,
      category: input.category,
      title: input.title,
      amountCents: input.amountCents,
      paidByMemberId: input.paidByMemberId,
      splitMemberIds,
      occurredAt: input.occurredAt,
      recurrence: input.recurrence,
    };

    if (input.recurrence) {
      entry.recurringReminderId = createLedgerReminder(familyId, entry, input.recurrence, createdAt).id;
    }

    state.ledgerEntries.push(entry);
    audit({
      familyId,
      actorMemberId: input.paidByMemberId,
      action: "ledger_entry.created",
      resourceType: "ledger_entry",
      resourceId: entry.id,
    });
    await persist();

    return entry;
  },

  async listLedgerGoalFunds(familyId: string) {
    await loadState();
    return state.ledgerGoalFunds
      .filter((goal) => goal.familyId === familyId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  },

  async createLedgerGoalFund(familyId: string, input: CreateLedgerGoalFundInput) {
    await loadState();
    const goal: LedgerGoalFund = {
      id: randomUUID(),
      familyId,
      title: input.title,
      targetAmountCents: input.targetAmountCents,
      currentAmountCents: input.currentAmountCents ?? 0,
      createdByMemberId: input.createdByMemberId,
      dueAt: input.dueAt,
      createdAt: now(),
      completedAt:
        input.currentAmountCents !== undefined && input.currentAmountCents >= input.targetAmountCents ? now() : undefined,
    };

    state.ledgerGoalFunds.push(goal);
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "ledger_goal_fund.created",
      resourceType: "ledger_goal_fund",
      resourceId: goal.id,
    });
    await persist();

    return goal;
  },

  async getLedgerMonthlySummary(familyId: string, month?: string) {
    await loadState();
    return ledgerSummaryForMonth(familyId, month ?? currentLedgerMonth());
  },

  async listDigitalSpaceItems(familyId: string, kind?: DigitalSpaceItemKind) {
    await loadState();
    return state.digitalSpaceItems
      .filter((item) => item.familyId === familyId && (!kind || item.kind === kind))
      .map(digitalSpaceItemWithMetadata)
      .sort((left, right) => digitalSpaceSortTime(right) - digitalSpaceSortTime(left));
  },

  async createDigitalSpaceItem(familyId: string, input: CreateDigitalSpaceItemInput) {
    await loadState();
    const createdAt = now();
    const item: DigitalSpaceItem = {
      id: randomUUID(),
      familyId,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      url: input.url,
      occurredAt: input.occurredAt,
      createdByMemberId: input.createdByMemberId,
      activityId: input.activityId,
      place: input.place,
      taggedMemberIds: input.taggedMemberIds ?? [],
      mediaItems: (input.mediaItems ?? []).map((media) => ({
        id: randomUUID(),
        createdAt,
        ...media,
      })),
      securityWarning: input.kind === "account" ? accountSecurityWarning : undefined,
      createdAt,
    };

    state.digitalSpaceItems.push(item);
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "digital_space_item.created",
      resourceType: "digital_space_item",
      resourceId: item.id,
    });
    await persist();

    return digitalSpaceItemWithMetadata(item);
  },

  async listAuditEvents(familyId: string) {
    await loadState();
    return state.auditEvents.filter((event) => event.familyId === familyId);
  },

  async resetForTests() {
    state = defaultState();
    await persist();
  },
};
