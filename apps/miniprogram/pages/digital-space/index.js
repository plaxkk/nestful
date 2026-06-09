const { api } = require("../../utils/api");
const { session } = require("../../utils/session");

const itemKinds = [
  { label: "资料", value: "document" },
  { label: "账号", value: "account" },
  { label: "记忆", value: "memory" },
];
const filterKinds = [{ label: "全部", value: "all" }, ...itemKinds];
const mediaKindOptions = [
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
  { label: "文件", value: "file" },
  { label: "链接", value: "link" },
];

const kindLabel = (kind) => itemKinds.find((item) => item.value === kind)?.label ?? "条目";
const memberName = (members, memberId) => members.find((member) => member.id === memberId)?.displayName ?? "家人";
const formatDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
};

const withItemText = (item, members) => ({
  ...item,
  kindLabel: kindLabel(item.kind),
  createdAtText: new Date(item.createdAt).toLocaleDateString(),
  occurredAtText: formatDate(item.occurredAt),
  summaryText: item.summary || "还没有补充说明",
  placeText: item.place ? `地点：${item.place}` : "",
  peopleText:
    item.taggedMemberIds.length > 0 ? `人物：${item.taggedMemberIds.map((id) => memberName(members, id)).join("、")}` : "",
  activityText: item.activityId ? "关联活动" : "",
  mediaText:
    item.mediaItems && item.mediaItems.length > 0
      ? `媒体：${item.mediaItems.map((media) => media.label || kindLabel(item.kind)).join("、")}`
      : "",
  warningText: item.securityWarning ?? "",
});

const filterItems = (items, filterKind) => (filterKind === "all" ? items : items.filter((item) => item.kind === filterKind));

const todayDateInput = () => new Date().toISOString().slice(0, 10);

Page({
  data: {
    itemKinds,
    filterKinds,
    mediaKindOptions,
    kindIndex: 0,
    filterIndex: 0,
    mediaKindIndex: 3,
    tagMemberIndex: 0,
    titleInput: "家庭资料",
    summaryInput: "放一份家里人常用的资料说明",
    urlInput: "",
    occurredAtInput: todayDateInput(),
    placeInput: "",
    mediaLabelInput: "",
    members: [],
    memberOptions: [],
    items: [],
    visibleItems: [],
    loading: false,
  },

  onShow() {
    this.loadPage();
  },

  onKindChange(event) {
    const kindIndex = Number(event.detail.value);
    const kind = itemKinds[kindIndex]?.value;

    this.setData({
      kindIndex,
      titleInput: kind === "account" ? "视频会员账号" : kind === "memory" ? "一次家庭出行" : "家庭资料",
      summaryInput:
        kind === "account"
          ? "这里只记录账号说明，不保存密码"
          : kind === "memory"
            ? "写下这段记忆发生了什么"
            : "放一份家里人常用的资料说明",
      mediaKindIndex: kind === "memory" ? 0 : kind === "document" ? 2 : 3,
    });
  },

  onFilterChange(event) {
    const filterIndex = Number(event.detail.value);
    const filterKind = filterKinds[filterIndex]?.value ?? "all";

    this.setData({
      filterIndex,
      visibleItems: filterItems(this.data.items, filterKind),
    });
  },

  onTitleInput(event) {
    this.setData({ titleInput: event.detail.value });
  },

  onSummaryInput(event) {
    this.setData({ summaryInput: event.detail.value });
  },

  onUrlInput(event) {
    this.setData({ urlInput: event.detail.value });
  },

  onOccurredAtInput(event) {
    this.setData({ occurredAtInput: event.detail.value });
  },

  onPlaceInput(event) {
    this.setData({ placeInput: event.detail.value });
  },

  onMediaLabelInput(event) {
    this.setData({ mediaLabelInput: event.detail.value });
  },

  onMediaKindChange(event) {
    this.setData({ mediaKindIndex: Number(event.detail.value) });
  },

  onTagMemberChange(event) {
    this.setData({ tagMemberIndex: Number(event.detail.value) });
  },

  async loadPage() {
    await this.loadMembers();
    await this.loadItems();
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
        memberOptions: members.map((member) => member.displayName),
      });
    } catch {
      this.setData({
        members: [],
        memberOptions: [],
      });
    }
  },

  async loadItems() {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    this.setData({ loading: true });

    try {
      const response = await api.listDigitalSpaceItems(family.id);
      const items = response.data.map((item) => withItemText(item, this.data.members));
      const filterKind = filterKinds[this.data.filterIndex]?.value ?? "all";

      this.setData({
        items,
        visibleItems: filterItems(items, filterKind),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: "数字空间加载失败，请确认 API 已启动",
        icon: "none",
      });
    }
  },

  async onCreateItem() {
    const family = session.getFamily();
    const member = session.getMember();
    const kind = itemKinds[this.data.kindIndex]?.value;
    const title = this.data.titleInput.trim();
    const summary = this.data.summaryInput.trim();
    const url = this.data.urlInput.trim();
    const occurredAtInput = this.data.occurredAtInput.trim();
    const occurredAt =
      kind === "memory" && occurredAtInput ? new Date(`${occurredAtInput}T00:00:00`).toISOString() : undefined;
    const place = this.data.placeInput.trim();
    const taggedMember = this.data.members[this.data.tagMemberIndex];
    const mediaKind = mediaKindOptions[this.data.mediaKindIndex]?.value ?? "link";
    const mediaLabel = this.data.mediaLabelInput.trim() || title;

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none",
      });
      return;
    }

    if (!kind || !title) {
      wx.showToast({
        title: "请填写标题",
        icon: "none",
      });
      return;
    }

    wx.showLoading({ title: "保存中" });

    try {
      await api.createDigitalSpaceItem(family.id, {
        kind,
        title,
        summary,
        url,
        createdByMemberId: member.id,
        occurredAt,
        place: kind === "memory" ? place : undefined,
        taggedMemberIds: kind === "memory" && taggedMember ? [taggedMember.id] : undefined,
        mediaItems: url
          ? [
              {
                kind: mediaKind,
                label: mediaLabel,
                url,
              },
            ]
          : undefined,
      });

      wx.hideLoading();
      this.setData({
        titleInput: kind === "account" ? "视频会员账号" : kind === "memory" ? "一次家庭出行" : "家庭资料",
        summaryInput: "",
        urlInput: "",
        placeInput: "",
        mediaLabelInput: "",
        occurredAtInput: todayDateInput(),
      });
      await this.loadItems();
      wx.showToast({
        title: "已放入空间",
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
});
