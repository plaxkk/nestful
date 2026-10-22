import {
  api, errorMessage,
  type DigitalSpaceItem,
  type DigitalSpaceItemKind,
  type DigitalSpaceMediaKind,
  type FamilyMember
} from "../../utils/api";
import { session } from "../../utils/session";
import { publicProductShare } from "../../utils/discovery";

const pageRefreshIntervalMs = 30 * 1000;

type LoadOptions = {
  force?: boolean;
  showLoading?: boolean;
};

const itemKinds: Array<{ label: string; value: DigitalSpaceItemKind }> = [
  { label: "资料", value: "document" },
  { label: "账号说明", value: "account" },
  { label: "家庭记忆", value: "memory" }
];
const filterKinds: Array<{ label: string; value: DigitalSpaceItemKind | "all" }> = [
  { label: "全部", value: "all" },
  ...itemKinds
];
const mediaKindOptions: Array<{ label: string; value: DigitalSpaceMediaKind }> = [
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
  { label: "文件", value: "file" },
  { label: "链接", value: "link" }
];

const kindLabel = (kind: DigitalSpaceItemKind) => itemKinds.find((item) => item.value === kind)?.label ?? "条目";
const memberName = (members: FamilyMember[], memberId: string) =>
  members.find((member) => member.id === memberId)?.displayName ?? "家人";
const formatDate = (value: string | undefined) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
};

const withItemText = (item: DigitalSpaceItem, members: FamilyMember[]) => ({
  ...item,
  kindLabel: kindLabel(item.kind),
  createdAtText: formatDate(item.createdAt),
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
  warningText: item.securityWarning ?? ""
});

type DisplayDigitalSpaceItem = ReturnType<typeof withItemText>;

const filterItems = (
  items: DisplayDigitalSpaceItem[],
  filterKind: DigitalSpaceItemKind | "all",
) => (filterKind === "all" ? items : items.filter((item) => item.kind === filterKind));

const todayDateInput = () => formatDate(new Date().toISOString());

Page({
  data: {
    busy:false, formVisible:false, detailsVisible:false, familyName:"", error:"",
    itemKinds,
    filterKinds,
    mediaKindOptions,
    kindIndex: 0,
    filterIndex: 0,
    mediaKindIndex: 3,
    tagMemberIndex: 0,
    titleInput: "",
    summaryInput: "",
    urlInput: "",
    occurredAtInput: todayDateInput(),
    placeInput: "",
    mediaLabelInput: "",
    members: [] as FamilyMember[],
    memberOptions: [] as string[],
    items: [] as DisplayDigitalSpaceItem[],
    visibleItems: [] as DisplayDigitalSpaceItem[],
    loading: false,
    refreshing: false,
    lastLoadedAt: 0
  },

  loadEpoch: 0,loadedRevision:-1,
  currentFamilyId: "",
  onShow() {
    const family = session.getFamily();
    if (!family || family.id !== this.currentFamilyId) {
      this.setData({ members: [], memberOptions: [], items: [], visibleItems: [], lastLoadedAt: 0, refreshing: false, formVisible:false, titleInput:"", summaryInput:"", urlInput:"", placeInput:"" });
      this.currentFamilyId = family ? family.id : "";
    }
    this.setData({familyName:family?family.name:""});
    void this.loadPage();
  },
  onHide() { this.loadEpoch++; this.setData({ refreshing: false, loading: false }); },
  onToggleForm(){if(this.data.busy)return;this.setData({formVisible:!this.data.formVisible});wx.pageScrollTo({scrollTop:0,duration:200});},
  onToggleDetails(){this.setData({detailsVisible:!this.data.detailsVisible});},
  onOccurredDateChange(e:WechatMiniprogram.PickerChange){this.setData({occurredAtInput:String(e.detail.value)});},
  onRetry(){void this.loadPage({force:true,showLoading:true});},
  onShareAppMessage() { return publicProductShare(); },
  onCopyLink(e:WechatMiniprogram.TouchEvent){const url=e.currentTarget.dataset.url as string;if(url)wx.setClipboardData({data:url});},

  onKindChange(event: WechatMiniprogram.PickerChange) {
    const kindIndex = Number(event.detail.value);
    const kind = itemKinds[kindIndex]?.value;

    this.setData({
      kindIndex,
      mediaKindIndex: kind === "memory" ? 0 : kind === "document" ? 2 : 3
    });
  },

  onFilterChange(event: WechatMiniprogram.PickerChange) {
    const filterIndex = Number(event.detail.value);
    const filterKind = filterKinds[filterIndex]?.value ?? "all";

    this.setData({
      filterIndex,
      visibleItems: filterItems(this.data.items, filterKind)
    });
  },

  onTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ titleInput: event.detail.value });
  },

  onSummaryInput(event: WechatMiniprogram.Input) {
    this.setData({ summaryInput: event.detail.value });
  },

  onUrlInput(event: WechatMiniprogram.Input) {
    this.setData({ urlInput: event.detail.value });
  },

  onOccurredAtInput(event: WechatMiniprogram.Input) {
    this.setData({ occurredAtInput: event.detail.value });
  },

  onPlaceInput(event: WechatMiniprogram.Input) {
    this.setData({ placeInput: event.detail.value });
  },

  onMediaLabelInput(event: WechatMiniprogram.Input) {
    this.setData({ mediaLabelInput: event.detail.value });
  },

  onMediaKindChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ mediaKindIndex: Number(event.detail.value) });
  },

  onTagMemberChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ tagMemberIndex: Number(event.detail.value) });
  },

  async loadPage(options: LoadOptions = {}) {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    if (
      !options.force && this.loadedRevision===session.getHomeRevision() &&
      this.data.lastLoadedAt > 0 &&
      Date.now() - this.data.lastLoadedAt < pageRefreshIntervalMs
    ) {
      return;
    }

    if (this.data.refreshing && !options.force) {
      return;
    }

    const epoch = ++this.loadEpoch,revision=session.getHomeRevision();
    const cachedMembers = session.getMembers(family.id);

    if (cachedMembers.length > 0 && this.data.members.length === 0) {
      this.setData({
        members: cachedMembers,
        memberOptions: ["不标记人物", ...cachedMembers.map((member) => member.displayName)]
      });
    }

    const shouldShowLoading = options.showLoading ?? this.data.visibleItems.length === 0;

    this.setData({
      loading: shouldShowLoading,
      refreshing: true, error:""
    });

    try {
      const [membersResponse, itemsResponse] = await Promise.all([
        api.listMembers(family.id),
        api.listDigitalSpaceItems(family.id)
      ]);
      if (epoch !== this.loadEpoch || !session.isFamily(family.id)) return;
      this.loadedRevision=revision;
      const members = membersResponse.data;
      const items = itemsResponse.data.map((item) => withItemText(item, members));
      const filterKind = filterKinds[this.data.filterIndex]?.value ?? "all";
      session.setMembers(family.id, members);

      this.setData({
        members,
        memberOptions: ["不标记人物", ...members.map((member) => member.displayName)],
        items,
        visibleItems: filterItems(items, filterKind),
        loading: false,
        refreshing: false,
        lastLoadedAt: Date.now()
      });
    } catch (error) {
      if (epoch !== this.loadEpoch || !session.isFamily(family.id)) return;
      this.setData({ loading: false, refreshing: false, error:"家庭记录暂时加载失败，请检查网络后重试。" });
      wx.showToast({
        title: "数字空间加载失败，请检查网络后重试",
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
        memberOptions: ["不标记人物", ...members.map((member) => member.displayName)]
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

  async loadItems(options: LoadOptions = {}) {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    const shouldShowLoading = options.showLoading ?? this.data.visibleItems.length === 0;

    this.setData({ loading: shouldShowLoading });

    try {
      const response = await api.listDigitalSpaceItems(family.id);
      const items = response.data.map((item) => withItemText(item, this.data.members));
      const filterKind = filterKinds[this.data.filterIndex]?.value ?? "all";

      this.setData({
        items,
        visibleItems: filterItems(items, filterKind),
        loading: false,
        lastLoadedAt: Date.now()
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: "数字空间加载失败，请检查网络后重试",
        icon: "none"
      });
    }
  },

  async onCreateItem() {
    if(this.data.busy)return;
    const family = session.getFamily();
    const member = session.getMember();
    const kind = itemKinds[this.data.kindIndex]?.value;
    const title = this.data.titleInput.trim();
    const summary = this.data.summaryInput.trim();
    const url = this.data.urlInput.trim();
    const occurredAtInput = this.data.occurredAtInput.trim();
    const occurredDate=kind==='memory'&&occurredAtInput?new Date(`${occurredAtInput}T00:00:00`):undefined;
    if(occurredDate&&Number.isNaN(occurredDate.getTime())){wx.showToast({title:'请选择有效日期',icon:'none'});return;}
    const occurredAt=occurredDate?.toISOString();
    const place = this.data.placeInput.trim();
    const taggedMember = this.data.members[this.data.tagMemberIndex - 1];
    const mediaKind = mediaKindOptions[this.data.mediaKindIndex]?.value ?? "link";
    const mediaLabel = this.data.mediaLabelInput.trim() || title;

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    if (!kind || !title) {
      wx.showToast({
        title: "请填写标题",
        icon: "none"
      });
      return;
    }

    if(url&&!/^https?:\/\//i.test(url)){wx.showToast({title:'链接请以 http:// 或 https:// 开头',icon:'none'});return;}
    this.setData({busy:true});
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
                url
              }
            ]
          : undefined
      });

      wx.hideLoading();
      this.setData({
        titleInput: "", formVisible:false, detailsVisible:false, tagMemberIndex:0,
        summaryInput: "",
        urlInput: "",
        placeInput: "",
        mediaLabelInput: "",
        occurredAtInput: todayDateInput()
      });
      await this.loadItems({ showLoading: false });
      wx.showToast({
        title: "已保存记录",
        icon: "success"
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: errorMessage(error,"保存失败，请检查网络后重试"),
        icon: "none"
      });
    } finally { this.setData({busy:false}); }
  }
});
