const { api } = require("../../utils/api");
const { session } = require("../../utils/session");
const { requestReminderSubscription } = require("../../utils/wechat");

const reminderTypes = [
  { label: "生日", value: "birthday" },
  { label: "吃药", value: "medicine" },
  { label: "运动", value: "exercise" },
];

const pad = (value) => value.toString().padStart(2, "0");

const formatInputTime = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;

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

const withReminderText = (reminder) => ({
  ...reminder,
  typeLabel: typeLabel(reminder.type),
  dueAtText: formatInputTime(new Date(reminder.dueAt)),
  statusLabel: `${reminder.completedAt ? "已完成" : "待提醒"}${notificationLabel(reminder)}`,
  isCompleted: Boolean(reminder.completedAt),
});

Page({
  data: {
    reminderTypes,
    typeIndex: 1,
    titleInput: "提醒吃药",
    dueAtInput: defaultDueAtInput(),
    reminders: [],
    loading: false,
  },

  onShow() {
    this.loadReminders();
  },

  onTypeChange(event) {
    const typeIndex = Number(event.detail.value);
    const nextTitle =
      reminderTypes[typeIndex]?.value === "birthday"
        ? "记录家人生日"
        : reminderTypes[typeIndex]?.value === "exercise"
          ? "提醒运动"
          : "提醒吃药";

    this.setData({
      typeIndex,
      titleInput: nextTitle,
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

  async onCreateReminder() {
    const family = session.getFamily();
    const member = session.getMember();
    const title = this.data.titleInput.trim();
    const dueAt = normalizeDueAt(this.data.dueAtInput.trim());
    const reminderType = reminderTypes[this.data.typeIndex]?.value;

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none",
      });
      return;
    }

    if (!title || !dueAt || !reminderType) {
      wx.showToast({
        title: "请填写提醒内容和时间",
        icon: "none",
      });
      return;
    }

    wx.showLoading({ title: "保存中" });

    try {
      const subscription = await requestReminderSubscription();
      await api.createReminder(family.id, {
        type: reminderType,
        title,
        dueAt,
        createdByMemberId: member.id,
        assigneeMemberId: member.id,
        notificationSubscription: subscription
          ? {
              templateId: subscription.templateId,
              recipientMemberId: member.id,
              subscriptionStatus: subscription.subscriptionStatus,
            }
          : undefined,
      });

      wx.hideLoading();
      this.setData({
        titleInput: reminderType === "birthday" ? "记录家人生日" : reminderType === "exercise" ? "提醒运动" : "提醒吃药",
        dueAtInput: defaultDueAtInput(),
      });
      await this.loadReminders();
      wx.showToast({
        title: subscription?.subscriptionStatus === "accept" ? "提醒已保存，到点会通知" : "提醒已保存",
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
