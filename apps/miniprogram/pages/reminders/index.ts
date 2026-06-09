import {
  api,
  type FamilyMember,
  type Reminder,
  type ReminderFrequency,
  type ReminderTargetScope,
  type ReminderType
} from "../../utils/api";
import { session } from "../../utils/session";
import { requestReminderSubscription } from "../../utils/wechat";

const reminderTypes: Array<{ label: string; value: ReminderType }> = [
  { label: "生日", value: "birthday" },
  { label: "吃药", value: "medicine" },
  { label: "运动", value: "exercise" }
];

const frequencyOptions: Array<{ label: string; value: ReminderFrequency; timesOfDay: string[] }> = [
  { label: "仅一次", value: "once", timesOfDay: [] },
  { label: "每天一次", value: "daily_once", timesOfDay: ["08:00"] },
  { label: "每天两次", value: "daily_twice", timesOfDay: ["08:00", "20:00"] },
  { label: "每天三次", value: "daily_three_times", timesOfDay: ["08:00", "13:00", "20:00"] },
  { label: "每周一次", value: "weekly", timesOfDay: ["08:00"] }
];

const targetScopeOptions: Array<{ label: string; value: ReminderTargetScope }> = [
  { label: "全家一起", value: "family" },
  { label: "指定成员", value: "member" }
];

const advanceDayOptions = [0, 1, 3, 7, 14, 30].map((value) => ({
  label: value === 0 ? "不提前" : `提前 ${value} 天`,
  value
}));

const pad = (value: number) => value.toString().padStart(2, "0");

const formatInputTime = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;

const formatDateInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const defaultDueAtInput = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);

  return formatInputTime(date);
};

const normalizeDueAt = (value: string) => {
  const parsed = new Date(value.replace(" ", "T"));

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const nextBirthdayDueAt = (birthdayDate: string, advanceDays: number) => {
  const [monthText, dayText] = birthdayDate.split("-").slice(1);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!month || !day) {
    return undefined;
  }

  const now = new Date();
  let birthday = new Date(now.getFullYear(), month - 1, day, 8, 0, 0, 0);
  let dueAt = new Date(birthday);
  dueAt.setDate(dueAt.getDate() - advanceDays);

  if (dueAt.getTime() <= now.getTime()) {
    birthday = new Date(now.getFullYear() + 1, month - 1, day, 8, 0, 0, 0);
    dueAt = new Date(birthday);
    dueAt.setDate(dueAt.getDate() - advanceDays);
  }

  return dueAt.toISOString();
};

const memberName = (member: FamilyMember | undefined) => member?.displayName ?? "家人";

const typeLabel = (type: ReminderType) => reminderTypes.find((item) => item.value === type)?.label ?? "提醒";

const notificationLabel = (reminder: Reminder) => {
  if (!reminder.notification) {
    return "";
  }

  if (reminder.notification.sendStatus === "sent") {
    return " · 已发微信通知";
  }

  if (reminder.notification.sendStatus === "pending") {
    return " · 微信通知待发送";
  }

  return "";
};

const reminderMeta = (reminder: Reminder) => {
  const scheduleParts = [
    reminder.schedule?.targetLabel,
    reminder.schedule?.frequencyLabel,
    reminder.schedule?.birthdayDate ? `生日 ${reminder.schedule.birthdayDate}` : undefined
  ].filter(Boolean);

  return scheduleParts.length > 0 ? ` · ${scheduleParts.join(" · ")}` : "";
};

const withReminderText = (reminder: Reminder, hasNextOccurrence: boolean) => ({
  ...reminder,
  typeLabel: typeLabel(reminder.type),
  dueAtText: formatInputTime(new Date(reminder.dueAt)),
  statusLabel: `${reminder.completedAt ? "已完成" : "待提醒"}${hasNextOccurrence ? " · 下次已安排" : ""}${notificationLabel(reminder)}${reminderMeta(reminder)}`,
  isCompleted: Boolean(reminder.completedAt)
});

type ReminderBody = Parameters<typeof api.createReminder>[1];

const statusCodeFromError = (error: unknown) => {
  if (typeof error === "object" && error && "statusCode" in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;

    if (typeof statusCode === "number") {
      return statusCode;
    }
  }

  if (error instanceof Error) {
    const match = error.message.match(/status (\d+)/);

    return match ? Number(match[1]) : undefined;
  }

  return undefined;
};

const isAuthReminderError = (error: unknown) => {
  const statusCode = statusCodeFromError(error);

  return statusCode === 401 || statusCode === 403;
};

Page({
  data: {
    reminderTypes,
    frequencyOptions,
    targetScopeOptions,
    advanceDayOptions,
    typeIndex: 1,
    memberIndex: 0,
    frequencyIndex: 1,
    targetScopeIndex: 0,
    advanceDayIndex: 3,
    titleInput: "提醒吃药",
    dueAtInput: defaultDueAtInput(),
    birthdayDateInput: formatDateInput(new Date()),
    notifyOnBirthday: true,
    members: [] as FamilyMember[],
    memberOptions: [] as string[],
    reminders: [] as Array<Reminder & { typeLabel: string; dueAtText: string; statusLabel: string; isCompleted: boolean }>,
    loading: false
  },

  onShow() {
    void Promise.all([this.loadMembers(), this.loadReminders()]);
  },

  onTypeChange(event: WechatMiniprogram.PickerChange) {
    const typeIndex = Number(event.detail.value);
    const reminderType = reminderTypes[typeIndex]?.value;
    const nextTitle = reminderType === "birthday" ? "家人生日" : reminderType === "exercise" ? "提醒运动" : "提醒吃药";

    this.setData({
      typeIndex,
      titleInput: nextTitle,
      frequencyIndex: reminderType === "medicine" ? 1 : 0
    });
  },

  onMemberChange(event: WechatMiniprogram.PickerChange) {
    const memberIndex = Number(event.detail.value);
    const member = this.data.members[memberIndex];

    this.setData({
      memberIndex,
      birthdayDateInput: member?.birthday ?? this.data.birthdayDateInput
    });
  },

  onFrequencyChange(event: WechatMiniprogram.PickerChange) {
    this.setData({
      frequencyIndex: Number(event.detail.value)
    });
  },

  onTargetScopeChange(event: WechatMiniprogram.PickerChange) {
    this.setData({
      targetScopeIndex: Number(event.detail.value)
    });
  },

  onAdvanceDayChange(event: WechatMiniprogram.PickerChange) {
    this.setData({
      advanceDayIndex: Number(event.detail.value)
    });
  },

  onTitleInput(event: WechatMiniprogram.Input) {
    this.setData({
      titleInput: event.detail.value
    });
  },

  onDueAtInput(event: WechatMiniprogram.Input) {
    this.setData({
      dueAtInput: event.detail.value
    });
  },

  onBirthdayDateInput(event: WechatMiniprogram.Input) {
    this.setData({
      birthdayDateInput: event.detail.value
    });
  },

  onNotifyOnBirthdayChange(event: WechatMiniprogram.SwitchChange) {
    this.setData({
      notifyOnBirthday: event.detail.value
    });
  },

  async loadMembers() {
    const family = session.getFamily();

    if (!family) {
      return;
    }

    const cachedMembers = session.getMembers(family.id);

    if (cachedMembers.length > 0) {
      this.setData({
        members: cachedMembers,
        memberOptions: cachedMembers.map((item) => item.displayName),
        birthdayDateInput: cachedMembers[this.data.memberIndex]?.birthday ?? this.data.birthdayDateInput
      });
    }

    try {
      const response = await api.listMembers(family.id);
      const members = response.data;
      session.setMembers(family.id, members);

      this.setData({
        members,
        memberOptions: members.map((item) => item.displayName),
        birthdayDateInput: members[this.data.memberIndex]?.birthday ?? this.data.birthdayDateInput
      });
    } catch {
      this.setData({
        members: [],
        memberOptions: []
      });
    }
  },

  async loadReminders() {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    this.setData({ loading: true });

    try {
      const response = await api.listReminders(family.id);
      const pendingPlanIds = new Set(
        response.data
          .filter((reminder) => reminder.planId && !reminder.completedAt)
          .map((reminder) => reminder.planId as string),
      );

      this.setData({
        reminders: response.data
          .slice()
          .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))
          .map((reminder) => withReminderText(reminder, Boolean(reminder.planId && reminder.completedAt && pendingPlanIds.has(reminder.planId)))),
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: "提醒加载失败，请确认 API 已启动",
        icon: "none"
      });
    }
  },

  buildReminderBodies(member: FamilyMember, creatorId: string): ReminderBody[] {
    const reminderType = reminderTypes[this.data.typeIndex]?.value as ReminderType | undefined;
    const title = this.data.titleInput.trim();
    const frequency = frequencyOptions[this.data.frequencyIndex] ?? frequencyOptions[0];
    const targetScope = targetScopeOptions[this.data.targetScopeIndex]?.value ?? "family";

    if (!reminderType || !title) {
      return [];
    }

    if (reminderType === "birthday") {
      const birthdayDate = this.data.birthdayDateInput.trim();
      const advanceDays = advanceDayOptions[this.data.advanceDayIndex]?.value ?? 0;
      const bodies: ReminderBody[] = [];
      const birthdayTarget = memberName(member);

      if (advanceDays > 0) {
        const advanceDueAt = nextBirthdayDueAt(birthdayDate, advanceDays);

        if (advanceDueAt) {
          bodies.push({
            type: "birthday",
            title: `${birthdayTarget}生日提醒`,
            dueAt: advanceDueAt,
            createdByMemberId: creatorId,
            assigneeMemberId: member.id,
            targetScope: "member",
            targetMemberIds: [member.id],
            frequency: "yearly",
            schedule: {
              targetLabel: birthdayTarget,
              frequencyLabel: `提前 ${advanceDays} 天`,
              birthdayDate,
              advanceDays,
              notifyOnDay: this.data.notifyOnBirthday
            }
          });
        }
      }

      if (this.data.notifyOnBirthday) {
        const dayDueAt = nextBirthdayDueAt(birthdayDate, 0);

        if (dayDueAt) {
          bodies.push({
            type: "birthday",
            title: `${birthdayTarget}今天生日`,
            dueAt: dayDueAt,
            createdByMemberId: creatorId,
            assigneeMemberId: member.id,
            targetScope: "member",
            targetMemberIds: [member.id],
            frequency: "yearly",
            schedule: {
              targetLabel: birthdayTarget,
              frequencyLabel: "当天推送",
              birthdayDate,
              advanceDays: 0,
              notifyOnDay: true
            }
          });
        }
      }

      return bodies;
    }

    const dueAt = normalizeDueAt(this.data.dueAtInput.trim());

    if (!dueAt) {
      return [];
    }

    if (reminderType === "medicine") {
      return [
        {
          type: "medicine",
          title,
          dueAt,
          createdByMemberId: creatorId,
          assigneeMemberId: member.id,
          targetScope: "member",
          targetMemberIds: [member.id],
          frequency: frequency.value,
          schedule: {
            targetLabel: memberName(member),
            frequencyLabel: frequency.label,
            timesOfDay: frequency.timesOfDay
          }
        }
      ];
    }

    const isFamilyTarget = targetScope === "family";

    return [
      {
        type: "exercise",
        title,
        dueAt,
        createdByMemberId: creatorId,
        assigneeMemberId: isFamilyTarget ? creatorId : member.id,
        targetScope,
        targetMemberIds: isFamilyTarget ? this.data.members.map((item) => item.id) : [member.id],
        frequency: frequency.value,
        schedule: {
          targetLabel: isFamilyTarget ? "全家" : memberName(member),
          frequencyLabel: frequency.label,
          timesOfDay: frequency.timesOfDay
        }
      }
    ];
  },

  async onCreateReminder() {
    const family = session.getFamily();
    const creator = session.getMember();
    const selectedMember = this.data.members[this.data.memberIndex] ?? creator;

    if (!family || !creator) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    if (!selectedMember) {
      wx.showToast({
        title: "请先添加家庭成员",
        icon: "none"
      });
      return;
    }

    const reminderBodies = this.buildReminderBodies(selectedMember, creator.id);

    if (reminderBodies.length === 0) {
      wx.showToast({
        title: "请补全提醒设置",
        icon: "none"
      });
      return;
    }

    wx.showLoading({ title: "保存中" });

    try {
      let acceptedSubscription = false;

      for (const reminderBody of reminderBodies) {
        const subscription = await requestReminderSubscription(reminderBody.type);
        acceptedSubscription = acceptedSubscription || subscription?.subscriptionStatus === "accept";

        await api.createReminder(family.id, {
          ...reminderBody,
          notificationSubscription: subscription
            ? {
                templateId: subscription.templateId,
                recipientMemberId: creator.id,
                subscriptionStatus: subscription.subscriptionStatus
              }
            : undefined
        });
      }

      wx.hideLoading();
      this.setData({
        titleInput: reminderTypes[this.data.typeIndex]?.value === "birthday" ? "家人生日" : reminderTypes[this.data.typeIndex]?.value === "exercise" ? "提醒运动" : "提醒吃药",
        dueAtInput: defaultDueAtInput()
      });
      await this.loadReminders();
      wx.showToast({
        title: acceptedSubscription ? "提醒已保存，到点会通知" : "提醒已保存",
        icon: "success"
      });
    } catch (error) {
      wx.hideLoading();
      if (isAuthReminderError(error)) {
        session.clear();
        wx.showToast({
          title: "登录已失效，请重新进入家庭",
          icon: "none"
        });
        wx.redirectTo({ url: "/pages/home/index" });
        return;
      }

      wx.showToast({
        title: "保存失败，请确认 API 已启动",
        icon: "none"
      });
    }
  },

  async onCompleteReminder(event: WechatMiniprogram.TouchEvent) {
    const member = session.getMember();
    const reminderId = event.currentTarget.dataset.id as string | undefined;

    if (!member || !reminderId) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    try {
      await api.completeReminder(reminderId, {
        actorMemberId: member.id
      });
      await this.loadReminders();
      wx.showToast({
        title: "已标记完成",
        icon: "success"
      });
    } catch (error) {
      wx.showToast({
        title: "操作失败，请稍后再试",
        icon: "none"
      });
    }
  }
});
