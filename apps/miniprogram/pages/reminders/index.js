const { api } = require("../../utils/api");
const { session } = require("../../utils/session");
const { requestReminderSubscription } = require("../../utils/wechat");

const reminderTypes = [
  { label: "生日", value: "birthday" },
  { label: "吃药", value: "medicine" },
  { label: "运动", value: "exercise" },
];

const frequencyOptions = [
  { label: "仅一次", value: "once", timesOfDay: [] },
  { label: "每天一次", value: "daily_once", timesOfDay: ["08:00"] },
  { label: "每天两次", value: "daily_twice", timesOfDay: ["08:00", "20:00"] },
  { label: "每天三次", value: "daily_three_times", timesOfDay: ["08:00", "13:00", "20:00"] },
  { label: "每周一次", value: "weekly", timesOfDay: ["08:00"] },
];

const targetScopeOptions = [
  { label: "全家一起", value: "family" },
  { label: "指定成员", value: "member" },
];

const advanceDayOptions = [0, 1, 3, 7, 14, 30].map((value) => ({
  label: value === 0 ? "不提前" : `提前 ${value} 天`,
  value,
}));

const pad = (value) => value.toString().padStart(2, "0");

const formatInputTime = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;

const formatDateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const defaultDueAtInput = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);

  return formatInputTime(date);
};

const normalizeDueAt = (value) => {
  const parsed = new Date(value.replace(" ", "T"));

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const nextBirthdayDueAt = (birthdayDate, advanceDays) => {
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

const memberName = (member) => member?.displayName ?? "家人";

const typeLabel = (type) => reminderTypes.find((item) => item.value === type)?.label ?? "提醒";

const notificationLabel = (reminder) => {
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

const reminderMeta = (reminder) => {
  const scheduleParts = [
    reminder.schedule?.targetLabel,
    reminder.schedule?.frequencyLabel,
    reminder.schedule?.birthdayDate ? `生日 ${reminder.schedule.birthdayDate}` : undefined,
  ].filter(Boolean);

  return scheduleParts.length > 0 ? ` · ${scheduleParts.join(" · ")}` : "";
};

const withReminderText = (reminder) => ({
  ...reminder,
  typeLabel: typeLabel(reminder.type),
  dueAtText: formatInputTime(new Date(reminder.dueAt)),
  statusLabel: `${reminder.completedAt ? "已完成" : "待提醒"}${notificationLabel(reminder)}${reminderMeta(reminder)}`,
  isCompleted: Boolean(reminder.completedAt),
});

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
    members: [],
    memberOptions: [],
    reminders: [],
    loading: false,
  },

  onShow() {
    void Promise.all([this.loadMembers(), this.loadReminders()]);
  },

  onTypeChange(event) {
    const typeIndex = Number(event.detail.value);
    const reminderType = reminderTypes[typeIndex]?.value;
    const nextTitle = reminderType === "birthday" ? "家人生日" : reminderType === "exercise" ? "提醒运动" : "提醒吃药";

    this.setData({
      typeIndex,
      titleInput: nextTitle,
      frequencyIndex: reminderType === "medicine" ? 1 : 0,
    });
  },

  onMemberChange(event) {
    const memberIndex = Number(event.detail.value);
    const member = this.data.members[memberIndex];

    this.setData({
      memberIndex,
      birthdayDateInput: member?.birthday ?? this.data.birthdayDateInput,
    });
  },

  onFrequencyChange(event) {
    this.setData({
      frequencyIndex: Number(event.detail.value),
    });
  },

  onTargetScopeChange(event) {
    this.setData({
      targetScopeIndex: Number(event.detail.value),
    });
  },

  onAdvanceDayChange(event) {
    this.setData({
      advanceDayIndex: Number(event.detail.value),
    });
  },

  onTitleInput(event) {
    this.setData({
      titleInput: event.detail.value,
    });
  },

  onDueAtInput(event) {
    this.setData({
      dueAtInput: event.detail.value,
    });
  },

  onBirthdayDateInput(event) {
    this.setData({
      birthdayDateInput: event.detail.value,
    });
  },

  onNotifyOnBirthdayChange(event) {
    this.setData({
      notifyOnBirthday: event.detail.value,
    });
  },

  async loadMembers() {
    const family = session.getFamily();

    if (!family) {
      return;
    }

    try {
      const response = await api.listMembers(family.id);
      const members = response.data;

      this.setData({
        members,
        memberOptions: members.map((item) => item.displayName),
        birthdayDateInput: members[this.data.memberIndex]?.birthday ?? this.data.birthdayDateInput,
      });
    } catch {
      this.setData({
        members: [],
        memberOptions: [],
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

      this.setData({
        reminders: response.data.map(withReminderText),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: "提醒加载失败，请确认 API 已启动",
        icon: "none",
      });
    }
  },

  buildReminderBodies(member, creatorId) {
    const reminderType = reminderTypes[this.data.typeIndex]?.value;
    const title = this.data.titleInput.trim();
    const frequency = frequencyOptions[this.data.frequencyIndex] ?? frequencyOptions[0];
    const targetScope = targetScopeOptions[this.data.targetScopeIndex]?.value ?? "family";

    if (!reminderType || !title) {
      return [];
    }

    if (reminderType === "birthday") {
      const birthdayDate = this.data.birthdayDateInput.trim();
      const advanceDays = advanceDayOptions[this.data.advanceDayIndex]?.value ?? 0;
      const bodies = [];
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
              notifyOnDay: this.data.notifyOnBirthday,
            },
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
              notifyOnDay: true,
            },
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
            timesOfDay: frequency.timesOfDay,
          },
        },
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
          timesOfDay: frequency.timesOfDay,
        },
      },
    ];
  },

  async onCreateReminder() {
    const family = session.getFamily();
    const creator = session.getMember();
    const selectedMember = this.data.members[this.data.memberIndex] ?? creator;

    if (!family || !creator) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none",
      });
      return;
    }

    if (!selectedMember) {
      wx.showToast({
        title: "请先添加家庭成员",
        icon: "none",
      });
      return;
    }

    const reminderBodies = this.buildReminderBodies(selectedMember, creator.id);

    if (reminderBodies.length === 0) {
      wx.showToast({
        title: "请补全提醒设置",
        icon: "none",
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
                recipientMemberId: reminderBody.assigneeMemberId ?? creator.id,
                subscriptionStatus: subscription.subscriptionStatus,
              }
            : undefined,
        });
      }

      wx.hideLoading();
      this.setData({
        titleInput: reminderTypes[this.data.typeIndex]?.value === "birthday" ? "家人生日" : reminderTypes[this.data.typeIndex]?.value === "exercise" ? "提醒运动" : "提醒吃药",
        dueAtInput: defaultDueAtInput(),
      });
      await this.loadReminders();
      wx.showToast({
        title: acceptedSubscription ? "提醒已保存，到点会通知" : "提醒已保存",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "保存失败，请确认 API 已启动",
        icon: "none",
      });
    }
  },

  async onCompleteReminder(event) {
    const member = session.getMember();
    const reminderId = event.currentTarget.dataset.id;

    if (!member || !reminderId) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none",
      });
      return;
    }

    try {
      await api.completeReminder(reminderId, {
        actorMemberId: member.id,
      });
      await this.loadReminders();
      wx.showToast({
        title: "已标记完成",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: "操作失败，请稍后再试",
        icon: "none",
      });
    }
  },
});
