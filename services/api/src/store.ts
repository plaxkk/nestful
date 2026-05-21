import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
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
  ReminderType,
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

export interface CreateReminderInput {
  type: ReminderType;
  title: string;
  dueAt: string;
  createdByMemberId: string;
  assigneeMemberId?: string;
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
      ledgerEntries: parsed.ledgerEntries ?? [],
      digitalSpaceItems: parsed.digitalSpaceItems ?? [],
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

  getReminder(reminderId: string) {
    return state.reminders.find((reminder) => reminder.id === reminderId);
  },

  createReminder(familyId: string, input: CreateReminderInput) {
    const reminder: Reminder = {
      id: randomUUID(),
      familyId,
      type: input.type,
      title: input.title,
      dueAt: input.dueAt,
      assigneeMemberId: input.assigneeMemberId,
      createdByMemberId: input.createdByMemberId,
      enabled: true,
    };

    state.reminders.push(reminder);
    audit({
      familyId,
      actorMemberId: input.createdByMemberId,
      action: "reminder.created",
      resourceType: "reminder",
      resourceId: reminder.id,
    });
    persist();

    return reminder;
  },

  completeReminder(reminderId: string, actorMemberId: string) {
    const reminder = this.getReminder(reminderId);

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
    persist();

    return reminder;
  },

  listActivities(familyId: string) {
    return state.activities.filter((activity) => activity.familyId === familyId);
  },

  createActivity(familyId: string, input: CreateActivityInput) {
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
    persist();

    return activity;
  },

  listLedgerEntries(familyId: string) {
    return state.ledgerEntries.filter((entry) => entry.familyId === familyId);
  },

  createLedgerEntry(familyId: string, input: CreateLedgerEntryInput) {
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
    persist();

    return entry;
  },

  listDigitalSpaceItems(familyId: string) {
    return state.digitalSpaceItems.filter((item) => item.familyId === familyId);
  },

  createDigitalSpaceItem(familyId: string, input: CreateDigitalSpaceItemInput) {
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
    persist();

    return item;
  },

  listAuditEvents(familyId: string) {
    return state.auditEvents.filter((event) => event.familyId === familyId);
  },

  resetForTests() {
    state = defaultState();
    persist();
  },
};
