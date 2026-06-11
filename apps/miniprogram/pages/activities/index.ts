import { api, type Activity, type ActivityTaskStatus, type FamilyMember, type RsvpStatus } from "../../utils/api";
import { session } from "../../utils/session";

const pageRefreshIntervalMs = 30 * 1000;

type LoadOptions = {
  force?: boolean;
  showLoading?: boolean;
};

const pad = (value: number) => value.toString().padStart(2, "0");

const formatInputTime = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;

const defaultStartsAtInput = () => {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  date.setHours(10, 0, 0, 0);

  return formatInputTime(date);
};

const normalizeStartsAt = (value: string) => {
  const parsed = new Date(value.replace(" ", "T"));

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const memberName = (members: FamilyMember[], memberId: string | undefined) =>
  members.find((member) => member.id === memberId)?.displayName ?? "家人";

const statusLabelFor = (status: Activity["status"]) => {
  const labels: Record<Activity["status"], string> = {
    draft: "草稿",
    scheduled: "已安排",
    completed: "已完成",
    cancelled: "已取消"
  };

  return labels[status];
};

const shareTextFor = (activity: Activity, members: FamilyMember[]) => {
  if (activity.shareText) {
    return activity.shareText;
  }

  const startsAt = formatInputTime(new Date(activity.startsAt));
  const location = activity.location ? `地点：${activity.location}` : "地点：待定";
  const participants = activity.participants ?? [];
  const accepted = participants.filter((participant) => participant.rsvp === "accepted").length;
  const pending = participants.filter((participant) => participant.rsvp === "pending").length;
  const taskCount = activity.tasks?.length ?? 0;
  const doneTasks = activity.tasks?.filter((task) => task.status === "done").length ?? 0;

  return `家庭活动：${activity.title}\n时间：${startsAt}\n${location}\n状态：${statusLabelFor(activity.status)}\n确认 ${accepted} 人，未定 ${pending} 人\n协作任务：${doneTasks}/${taskCount} 已完成\n打开家庭助手一起确认。`;
};

const participantSummaryFor = (activity: Activity, members: FamilyMember[]) => {
  const participants = activity.participants ?? [];

  if (participants.length === 0) {
    return "还没有参与人";
  }

  return participants
    .map((participant) => {
      const labels: Record<RsvpStatus, string> = {
        accepted: "确认",
        tentative: "待定",
        declined: "无法参加",
        pending: "未回应"
      };

      return `${memberName(members, participant.memberId)} ${labels[participant.rsvp]}`;
    })
    .join(" · ");
};

const taskSummaryFor = (activity: Activity, members: FamilyMember[]) => {
  const tasks = activity.tasks ?? [];

  if (tasks.length === 0) {
    return "暂无协作任务";
  }

  return tasks
    .map((task) => `${task.status === "done" ? "已完成" : "待完成"}：${task.title}${task.assigneeMemberId ? `（${memberName(members, task.assigneeMemberId)}）` : ""}`)
    .join(" · ");
};

const withActivityText = (activity: Activity, members: FamilyMember[]) => ({
  ...activity,
  startsAtText: formatInputTime(new Date(activity.startsAt)),
  locationText: activity.location || "地点待定",
  descriptionText: activity.description || "家人一起安排一下",
  statusLabel: statusLabelFor(activity.status),
  participantSummaryText: participantSummaryFor(activity, members),
  taskSummaryText: taskSummaryFor(activity, members),
  memoryText: activity.memoryItemId ? "已生成家庭记忆" : "",
  canFinish: activity.status === "draft" || activity.status === "scheduled",
  sharePath: activity.sharePath ?? `/pages/activities/index?activityId=${activity.id}`,
  shareText: shareTextFor(activity, members)
});

Page({
  data: {
    titleInput: "周末家庭聚会",
    startsAtInput: defaultStartsAtInput(),
    locationInput: "家里",
    descriptionInput: "一起吃饭、聊天、看看近况",
    taskInput: "准备家人合照",
    taskAssigneeIndex: 0,
    members: [] as FamilyMember[],
    memberOptions: [] as string[],
    activities: [] as Array<
      Activity & {
        startsAtText: string;
        locationText: string;
        descriptionText: string;
        statusLabel: string;
        participantSummaryText: string;
        taskSummaryText: string;
        memoryText: string;
        canFinish: boolean;
        sharePath: string;
        shareText: string;
      }
    >,
    loading: false,
    refreshing: false,
    lastLoadedAt: 0,
    latestShareText: "",
    latestSharePath: "/pages/activities/index"
  },

  onShow() {
    void this.loadPage();
  },

  onTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ titleInput: event.detail.value });
  },

  onStartsAtInput(event: WechatMiniprogram.Input) {
    this.setData({ startsAtInput: event.detail.value });
  },

  onLocationInput(event: WechatMiniprogram.Input) {
    this.setData({ locationInput: event.detail.value });
  },

  onDescriptionInput(event: WechatMiniprogram.Input) {
    this.setData({ descriptionInput: event.detail.value });
  },

  onTaskInput(event: WechatMiniprogram.Input) {
    this.setData({ taskInput: event.detail.value });
  },

  onTaskAssigneeChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ taskAssigneeIndex: Number(event.detail.value) });
  },

  async loadPage(options: LoadOptions = {}) {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    if (
      !options.force &&
      this.data.lastLoadedAt > 0 &&
      Date.now() - this.data.lastLoadedAt < pageRefreshIntervalMs
    ) {
      return;
    }

    if (this.data.refreshing && !options.force) {
      return;
    }

    const cachedMembers = session.getMembers(family.id);

    if (cachedMembers.length > 0 && this.data.members.length === 0) {
      this.setData({
        members: cachedMembers,
        memberOptions: cachedMembers.map((member) => member.displayName)
      });
    }

    const shouldShowLoading = options.showLoading ?? this.data.activities.length === 0;

    this.setData({
      loading: shouldShowLoading,
      refreshing: true
    });

    try {
      const [membersResponse, activitiesResponse] = await Promise.all([
        api.listMembers(family.id),
        api.listActivities(family.id)
      ]);
      const members = membersResponse.data;
      const activities = activitiesResponse.data.map((activity) => withActivityText(activity, members));
      session.setMembers(family.id, members);

      this.setData({
        members,
        memberOptions: members.map((member) => member.displayName),
        activities,
        latestShareText: activities[0]?.shareText ?? "",
        latestSharePath: activities[0]?.sharePath ?? "/pages/activities/index",
        loading: false,
        refreshing: false,
        lastLoadedAt: Date.now()
      });
    } catch (error) {
      this.setData({ loading: false, refreshing: false });
      wx.showToast({
        title: "活动加载失败，请确认 API 已启动",
        icon: "none"
      });
    }
  },

  async loadMembers() {
    const family = session.getFamily();

    if (!family) {
      return;
    }

    try {
      const response = await api.listMembers(family.id);
      const members = response.data;
      session.setMembers(family.id, members);

      this.setData({
        members,
        memberOptions: members.map((member) => member.displayName)
      });
    } catch {
      if (this.data.members.length === 0) {
        this.setData({
          members: [],
          memberOptions: []
        });
      }
    }
  },

  async loadActivities(options: LoadOptions = {}) {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    const shouldShowLoading = options.showLoading ?? this.data.activities.length === 0;

    this.setData({ loading: shouldShowLoading });

    try {
      const response = await api.listActivities(family.id);
      const activities = response.data.map((activity) => withActivityText(activity, this.data.members));

      this.setData({
        activities,
        latestShareText: activities[0]?.shareText ?? "",
        latestSharePath: activities[0]?.sharePath ?? "/pages/activities/index",
        loading: false,
        lastLoadedAt: Date.now()
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: "活动加载失败，请确认 API 已启动",
        icon: "none"
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
    const taskTitle = this.data.taskInput.trim();
    const taskAssignee = this.data.members[this.data.taskAssigneeIndex] ?? member;

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    if (!title || !startsAt) {
      wx.showToast({
        title: "请填写活动和时间",
        icon: "none"
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
        participantMemberIds: this.data.members.map((item) => item.id),
        tasks: taskTitle
          ? [
              {
                title: taskTitle,
                assigneeMemberId: taskAssignee.id
              }
            ]
          : undefined
      });
      const activity = withActivityText(response.data, this.data.members);

      wx.hideLoading();
      this.setData({
        titleInput: "周末家庭聚会",
        startsAtInput: defaultStartsAtInput(),
        locationInput: "家里",
        descriptionInput: "一起吃饭、聊天、看看近况",
        taskInput: "准备家人合照",
        latestShareText: activity.shareText,
        latestSharePath: activity.sharePath
      });
      await this.loadActivities({ showLoading: false });
      wx.showToast({
        title: "活动已发起",
        icon: "success"
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "保存失败，请确认 API 已启动",
        icon: "none"
      });
    }
  },

  async onRsvpActivity(event: WechatMiniprogram.TouchEvent) {
    const family = session.getFamily();
    const member = session.getMember();
    const activityId = event.currentTarget.dataset.id as string | undefined;
    const rsvp = event.currentTarget.dataset.rsvp as RsvpStatus | undefined;

    if (!family || !member || !activityId || !rsvp) {
      return;
    }

    await api.updateActivityRsvp(family.id, activityId, {
      actorMemberId: member.id,
      memberId: member.id,
      rsvp
    });
    await this.loadActivities({ showLoading: false });
  },

  async onCreateTask(event: WechatMiniprogram.TouchEvent) {
    const family = session.getFamily();
    const member = session.getMember();
    const activityId = event.currentTarget.dataset.id as string | undefined;
    const title = this.data.taskInput.trim();
    const assignee = this.data.members[this.data.taskAssigneeIndex] ?? member;

    if (!family || !member || !activityId || !title) {
      wx.showToast({
        title: "请填写协作任务",
        icon: "none"
      });
      return;
    }

    await api.createActivityTask(family.id, activityId, {
      actorMemberId: member.id,
      title,
      assigneeMemberId: assignee.id
    });
    this.setData({ taskInput: "" });
    await this.loadActivities({ showLoading: false });
  },

  async onUpdateTaskStatus(event: WechatMiniprogram.TouchEvent) {
    const family = session.getFamily();
    const member = session.getMember();
    const activityId = event.currentTarget.dataset.id as string | undefined;
    const taskId = event.currentTarget.dataset.taskId as string | undefined;
    const status = event.currentTarget.dataset.status as ActivityTaskStatus | undefined;

    if (!family || !member || !activityId || !taskId || !status) {
      return;
    }

    await api.updateActivityTask(family.id, activityId, taskId, {
      actorMemberId: member.id,
      status
    });
    await this.loadActivities({ showLoading: false });
  },

  async onUpdateActivityStatus(event: WechatMiniprogram.TouchEvent) {
    const family = session.getFamily();
    const member = session.getMember();
    const activityId = event.currentTarget.dataset.id as string | undefined;
    const status = event.currentTarget.dataset.status as "completed" | "cancelled" | undefined;

    if (!family || !member || !activityId || !status) {
      return;
    }

    await api.updateActivityStatus(family.id, activityId, {
      actorMemberId: member.id,
      status
    });
    await this.loadActivities({ showLoading: false });
  },

  onCopyShareText(event: WechatMiniprogram.TouchEvent) {
    const shareText = event.currentTarget.dataset.text as string | undefined;

    if (!shareText) {
      wx.showToast({
        title: "请先发起活动",
        icon: "none"
      });
      return;
    }

    wx.setClipboardData({
      data: shareText
    });
  },

  onShareAppMessage() {
    return {
      title: this.data.latestShareText ? "邀请家人参加活动" : "家庭活动日",
      path: this.data.latestSharePath
    };
  }
});
