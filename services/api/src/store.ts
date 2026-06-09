import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  Activity,
  ActivityStatus,
  AuditEvent,
  DigitalSpaceItem,
  DigitalSpaceItemKind,
  Family,
  FamilyInvitation,
  FamilyMember,
  FamilyRole,
  LedgerCategory,
  LedgerEntry,
  LedgerEntryType,
  Reminder,
  ReminderFrequency,
  ReminderNotification,
  ReminderSchedule,
  ReminderTargetScope,
  ReminderType,
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
}

export interface CreateDigitalSpaceItemInput {
  kind: DigitalSpaceItemKind;
  title: string;
  createdByMemberId: string;
  summary?: string;
  url?: string;
  occurredAt?: string;
  taggedMemberIds?: string[];
}

export interface CreateActivityInput {
  title: string;
  startsAt: string;
  createdByMemberId: string;
  status?: ActivityStatus;
  location?: string;
  description?: string;
  budgetCents?: number;
}

interface StoreState {
  families: Family[];
  members: FamilyMember[];
  invitations: FamilyInvitation[];
  reminders: Reminder[];
  activities: Activity[];
  ledgerEntries: LedgerEntry[];
  digitalSpaceItems: DigitalSpaceItem[];
  auditEvents: AuditEvent[];
}

const defaultState = (): StoreState => ({
  families: [],
  members: [],
  invitations: [],
  reminders: [],
  activities: [],
  ledgerEntries: [],
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

const normalizeState = (parsed: Partial<StoreState> | undefined): StoreState => ({
  ...defaultState(),
  ...(parsed ?? {}),
  families: parsed?.families ?? [],
  members: parsed?.members ?? [],
  invitations: parsed?.invitations ?? [],
  reminders: parsed?.reminders ?? [],
  activities: parsed?.activities ?? [],
  ledgerEntries: parsed?.ledgerEntries ?? [],
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

  async createInvitation(familyId: string, input: CreateInvitationInput) {
    await loadState();
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
    const recipientMemberId = input.notificationSubscription?.recipientMemberId;
    const recipientMember = recipientMemberId ? state.members.find((member) => member.id === recipientMemberId) : undefined;
    const notification: ReminderNotification | undefined =
      input.notificationSubscription && recipientMemberId && recipientMember
        ? {
            templateId: input.notificationSubscription.templateId,
            recipientMemberId,
            recipientOpenId: recipientMember.wechatOpenId,
            subscriptionStatus: input.notificationSubscription.subscriptionStatus,
            sendStatus:
              input.notificationSubscription.subscriptionStatus === "accept" && recipientMember.wechatOpenId
                ? "pending"
                : "skipped",
            requestedAt: now(),
            attemptCount: 0,
            lastError:
              input.notificationSubscription.subscriptionStatus === "accept" && !recipientMember.wechatOpenId
                ? "missing_recipient_openid"
                : undefined,
          }
        : undefined;
    const reminder: Reminder = {
      id: randomUUID(),
      familyId,
      type: input.type,
      title: input.title,
      dueAt: input.dueAt,
      assigneeMemberId: input.assigneeMemberId,
      targetScope: input.targetScope,
      targetMemberIds: input.targetMemberIds,
      frequency: input.frequency,
      schedule: input.schedule,
      createdByMemberId: input.createdByMemberId,
      enabled: true,
      notification,
    };

    state.reminders.push(reminder);
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
        !notification ||
        notification.sendStatus !== "pending" ||
        Date.parse(reminder.dueAt) > currentTime
      ) {
        continue;
      }

      summary.due += 1;

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
        summary.notConfigured += 1;
        continue;
      }

      notification.attemptCount += 1;
      notification.lastAttemptAt = now();
      notification.lastError = result.error ?? "wechat_send_failed";
      notification.sendStatus = notification.attemptCount >= 3 ? "failed" : "pending";
      summary.failed += 1;
    }

    if (summary.sent > 0 || summary.failed > 0 || summary.skipped > 0) {
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

    reminder.completedAt = now();
    audit({
      familyId: reminder.familyId,
      actorMemberId,
      action: "reminder.completed",
      resourceType: "reminder",
      resourceId: reminder.id,
    });
    await persist();

    return reminder;
  },

  async listActivities(familyId: string) {
    await loadState();
    return state.activities.filter((activity) => activity.familyId === familyId);
  },

  async createActivity(familyId: string, input: CreateActivityInput) {
    await loadState();
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

    state.activities.push(activity);
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "activity.created",
      resourceType: "activity",
      resourceId: activity.id,
    });
    await persist();

    return activity;
  },

  async listLedgerEntries(familyId: string) {
    await loadState();
    return state.ledgerEntries.filter((entry) => entry.familyId === familyId);
  },

  async createLedgerEntry(familyId: string, input: CreateLedgerEntryInput) {
    await loadState();
    const entry: LedgerEntry = {
      id: randomUUID(),
      familyId,
      type: input.type,
      category: input.category,
      title: input.title,
      amountCents: input.amountCents,
      paidByMemberId: input.paidByMemberId,
      splitMemberIds: input.splitMemberIds ?? [input.paidByMemberId],
      occurredAt: input.occurredAt,
    };

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

  async listDigitalSpaceItems(familyId: string) {
    await loadState();
    return state.digitalSpaceItems.filter((item) => item.familyId === familyId);
  },

  async createDigitalSpaceItem(familyId: string, input: CreateDigitalSpaceItemInput) {
    await loadState();
    const item: DigitalSpaceItem = {
      id: randomUUID(),
      familyId,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      url: input.url,
      occurredAt: input.occurredAt,
      createdByMemberId: input.createdByMemberId,
      taggedMemberIds: input.taggedMemberIds ?? [],
      createdAt: now(),
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

    return item;
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
