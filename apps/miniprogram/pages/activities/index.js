const { api } = require("../../utils/api");
const { session } = require("../../utils/session");

const pad = (value) => value.toString().padStart(2, "0");

const formatInputTime = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;

const defaultStartsAtInput = () => {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  date.setHours(10, 0, 0, 0);

  return formatInputTime(date);
};

const normalizeStartsAt = (value) => {
  const parsed = new Date(value.replace(" ", "T"));

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const shareTextFor = (activity) => {
  const startsAt = formatInputTime(new Date(activity.startsAt));
  const location = activity.location ? `地点：${activity.location}` : "地点：待定";

  return `家庭活动：${activity.title}\n时间：${startsAt}\n${location}\n打开家庭助手一起确认。`;
};

const withActivityText = (activity) => ({
  ...activity,
  startsAtText: formatInputTime(new Date(activity.startsAt)),
  locationText: activity.location || "地点待定",
  descriptionText: activity.description || "家人一起安排一下",
  statusLabel: activity.status === "scheduled" ? "已安排" : "草稿",
  shareText: shareTextFor(activity),
});

Page({
  data: {
    titleInput: "周末家庭聚会",
    startsAtInput: defaultStartsAtInput(),
    locationInput: "家里",
    descriptionInput: "一起吃饭、聊天、看看近况",
    activities: [],
    loading: false,
    latestShareText: "",
  },

  onShow() {
    this.loadActivities();
  },

  onTitleInput(event) {
    this.setData({ titleInput: event.detail.value });
  },

  onStartsAtInput(event) {
    this.setData({ startsAtInput: event.detail.value });
  },

  onLocationInput(event) {
    this.setData({ locationInput: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ descriptionInput: event.detail.value });
  },

  async loadActivities() {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    this.setData({ loading: true });

    try {
      const response = await api.listActivities(family.id);
      const activities = response.data.map(withActivityText);

      this.setData({
        activities,
        latestShareText: activities[0]?.shareText ?? "",
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: "活动加载失败，请确认 API 已启动",
        icon: "none",
      });
    }
  },

  async onCreateActivity() {
    const family = session.getFamily();
    const member = session.getMember();
    const title = this.data.titleInput.trim();
    const startsAt = normalizeStartsAt(this.data.startsAtInput.trim());
    const location = this.data.locationInput.trim();
    const description = this.data.descriptionInput.trim();

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none",
      });
      return;
    }

    if (!title || !startsAt) {
      wx.showToast({
        title: "请填写活动和时间",
        icon: "none",
      });
      return;
    }

    wx.showLoading({ title: "保存中" });

    try {
      const response = await api.createActivity(family.id, {
        title,
        startsAt,
        location,
        description,
        createdByMemberId: member.id,
      });
      const activity = withActivityText(response.data);

      wx.hideLoading();
      this.setData({
        titleInput: "周末家庭聚会",
        startsAtInput: defaultStartsAtInput(),
        locationInput: "家里",
        descriptionInput: "一起吃饭、聊天、看看近况",
        latestShareText: activity.shareText,
      });
      await this.loadActivities();
      wx.showToast({
        title: "活动已发起",
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

  onCopyShareText(event) {
    const shareText = event.currentTarget.dataset.text;

    if (!shareText) {
      wx.showToast({
        title: "请先发起活动",
        icon: "none",
      });
      return;
    }

    wx.setClipboardData({
      data: shareText,
    });
  },

  onShareAppMessage() {
    return {
      title: this.data.latestShareText ? "邀请家人参加活动" : "家庭活动日",
      path: "/pages/activities/index",
    };
  },
});
