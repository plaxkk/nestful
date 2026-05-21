import { api, type DigitalSpaceItem, type DigitalSpaceItemKind } from "../../utils/api";
import { session } from "../../utils/session";

const itemKinds: Array<{ label: string; value: DigitalSpaceItemKind }> = [
  { label: "资料", value: "document" },
  { label: "账号", value: "account" },
  { label: "记忆", value: "memory" }
];

const kindLabel = (kind: DigitalSpaceItemKind) => itemKinds.find((item) => item.value === kind)?.label ?? "条目";

const withItemText = (item: DigitalSpaceItem) => ({
  ...item,
  kindLabel: kindLabel(item.kind),
  createdAtText: new Date(item.createdAt).toLocaleDateString(),
  summaryText: item.summary || "还没有补充说明"
});

Page({
  data: {
    itemKinds,
    kindIndex: 0,
    titleInput: "家庭资料",
    summaryInput: "放一份家里人常用的资料说明",
    urlInput: "",
    items: [] as Array<DigitalSpaceItem & { kindLabel: string; createdAtText: string; summaryText: string }>,
    loading: false
  },

  onShow() {
    void this.loadItems();
  },

  onKindChange(event: WechatMiniprogram.PickerChange) {
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
            : "放一份家里人常用的资料说明"
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

  async loadItems() {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    this.setData({ loading: true });

    try {
      const response = await api.listDigitalSpaceItems(family.id);

      this.setData({
        items: response.data.map(withItemText),
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: "数字空间加载失败，请确认 API 已启动",
        icon: "none"
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

    wx.showLoading({ title: "保存中" });

    try {
      await api.createDigitalSpaceItem(family.id, {
        kind,
        title,
        summary,
        url,
        createdByMemberId: member.id
      });

      wx.hideLoading();
      this.setData({
        titleInput: kind === "account" ? "视频会员账号" : kind === "memory" ? "一次家庭出行" : "家庭资料",
        summaryInput: "",
        urlInput: ""
      });
      await this.loadItems();
      wx.showToast({
        title: "已放入空间",
        icon: "success"
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "保存失败，请确认 API 已启动",
        icon: "none"
      });
    }
  }
});
