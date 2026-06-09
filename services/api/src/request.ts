import type { FastifyReply } from "fastify";
import type {
  ActivityStatus,
  ActivityTaskStatus,
  DigitalSpaceItemKind,
  DigitalSpaceMediaKind,
  FamilyRole,
  LedgerCategory,
  LedgerEntryType,
  LedgerRecurrence,
  ReminderFrequency,
  ReminderNotification,
  ReminderTargetScope,
  ReminderType,
  RsvpStatus,
} from "@nestful/shared";

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const requiredString = (body: Record<string, unknown>, key: string) => {
  const value = body[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

export const optionalString = (body: Record<string, unknown>, key: string) => {
  const value = body[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

export const optionalRole = (body: Record<string, unknown>, key: string): FamilyRole | undefined => {
  const value = body[key];
  const roles: FamilyRole[] = ["admin", "member", "elder", "child", "guest"];

  return typeof value === "string" && roles.includes(value as FamilyRole) ? (value as FamilyRole) : undefined;
};

export const optionalBirthdayCalendar = (
  body: Record<string, unknown>,
  key: string,
): "solar" | "lunar" | undefined => {
  const value = body[key];

  return value === "solar" || value === "lunar" ? value : undefined;
};

export const optionalReminderType = (body: Record<string, unknown>, key: string): ReminderType | undefined => {
  const value = body[key];
  const types: ReminderType[] = ["birthday", "medicine", "exercise"];

  return typeof value === "string" && types.includes(value as ReminderType) ? (value as ReminderType) : undefined;
};

export const optionalReminderTargetScope = (
  body: Record<string, unknown>,
  key: string,
): ReminderTargetScope | undefined => {
  const value = body[key];
  const scopes: ReminderTargetScope[] = ["member", "family"];

  return typeof value === "string" && scopes.includes(value as ReminderTargetScope)
    ? (value as ReminderTargetScope)
    : undefined;
};

export const optionalReminderFrequency = (
  body: Record<string, unknown>,
  key: string,
): ReminderFrequency | undefined => {
  const value = body[key];
  const frequencies: ReminderFrequency[] = [
    "once",
    "daily_once",
    "daily_twice",
    "daily_three_times",
    "weekly",
    "monthly",
    "yearly",
  ];

  return typeof value === "string" && frequencies.includes(value as ReminderFrequency)
    ? (value as ReminderFrequency)
    : undefined;
};

export const optionalLedgerEntryType = (
  body: Record<string, unknown>,
  key: string,
): LedgerEntryType | undefined => {
  const value = body[key];
  const types: LedgerEntryType[] = ["expense", "income"];

  return typeof value === "string" && types.includes(value as LedgerEntryType) ? (value as LedgerEntryType) : undefined;
};

export const optionalLedgerCategory = (body: Record<string, unknown>, key: string): LedgerCategory | undefined => {
  const value = body[key];
  const categories: LedgerCategory[] = ["daily", "education", "health", "travel", "housing", "subscription", "other"];

  return typeof value === "string" && categories.includes(value as LedgerCategory) ? (value as LedgerCategory) : undefined;
};

export const optionalLedgerRecurrence = (
  body: Record<string, unknown>,
  key: string,
): LedgerRecurrence | undefined => {
  const value = body[key];
  const recurrences: LedgerRecurrence[] = ["monthly", "yearly"];

  return typeof value === "string" && recurrences.includes(value as LedgerRecurrence)
    ? (value as LedgerRecurrence)
    : undefined;
};

export const optionalDigitalSpaceKind = (
  body: Record<string, unknown>,
  key: string,
): DigitalSpaceItemKind | undefined => {
  const value = body[key];
  const kinds: DigitalSpaceItemKind[] = ["document", "account", "memory"];

  return typeof value === "string" && kinds.includes(value as DigitalSpaceItemKind)
    ? (value as DigitalSpaceItemKind)
    : undefined;
};

export const optionalDigitalSpaceMediaKind = (
  body: Record<string, unknown>,
  key: string,
): DigitalSpaceMediaKind | undefined => {
  const value = body[key];
  const kinds: DigitalSpaceMediaKind[] = ["image", "video", "file", "link"];

  return typeof value === "string" && kinds.includes(value as DigitalSpaceMediaKind)
    ? (value as DigitalSpaceMediaKind)
    : undefined;
};

export const optionalActivityStatus = (body: Record<string, unknown>, key: string): ActivityStatus | undefined => {
  const value = body[key];
  const statuses: ActivityStatus[] = ["draft", "scheduled", "completed", "cancelled"];

  return typeof value === "string" && statuses.includes(value as ActivityStatus) ? (value as ActivityStatus) : undefined;
};

export const optionalRsvpStatus = (body: Record<string, unknown>, key: string): RsvpStatus | undefined => {
  const value = body[key];
  const statuses: RsvpStatus[] = ["accepted", "declined", "tentative", "pending"];

  return typeof value === "string" && statuses.includes(value as RsvpStatus) ? (value as RsvpStatus) : undefined;
};

export const optionalActivityTaskStatus = (
  body: Record<string, unknown>,
  key: string,
): ActivityTaskStatus | undefined => {
  const value = body[key];
  const statuses: ActivityTaskStatus[] = ["open", "done"];

  return typeof value === "string" && statuses.includes(value as ActivityTaskStatus)
    ? (value as ActivityTaskStatus)
    : undefined;
};

export const optionalReminderNotificationStatus = (
  body: Record<string, unknown>,
  key: string,
): ReminderNotification["subscriptionStatus"] | undefined => {
  const value = body[key];
  const statuses: Array<ReminderNotification["subscriptionStatus"]> = ["accept", "reject", "ban", "filter", "unavailable"];

  return typeof value === "string" && statuses.includes(value as ReminderNotification["subscriptionStatus"])
    ? (value as ReminderNotification["subscriptionStatus"])
    : undefined;
};

export const optionalPositiveInteger = (body: Record<string, unknown>, key: string) => {
  const value = body[key];

  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
};

export const optionalStringArray = (body: Record<string, unknown>, key: string) => {
  const value = body[key];

  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0)
    ? value.map((item) => item.trim())
    : undefined;
};

export const sendApiError = (reply: FastifyReply, statusCode: number, error: string) =>
  reply.code(statusCode).send({ error });
