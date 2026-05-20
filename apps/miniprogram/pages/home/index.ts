import { api } from "../../utils/api";
import { session } from "../../utils/session";

Page({
  data: {
    familyNameInput: "我的家庭",
    ownerNameInput: "我",
    familyName: "我的家庭",
    quickActions: ["提醒爸妈吃药", "记住家人生日", "发起家庭聚会"]
  },

  onFamilyNameInput(event: WechatMiniprogram.Input) {
    this.setData({
      familyNameInput: event.detail.value
    });
  },

  onOwnerNameInput(event: WechatMiniprogram.Input) {
    this.setData({
      ownerNameInput: event.detail.value
    });
  },

  async onCreateFamily() {
    const familyName = this.data.familyNameInput.trim();
    const ownerName = this.data.ownerNameInput.trim();

    if (!familyName || !ownerName) {
      wx.showToast({
        title: "请填写家庭名和你的称呼",
        icon: "none"
      });
      return;
    }

    wx.showLoading({ title: "创建中" });

    try {
      const response = await api.createFamily({
        name: familyName,
        ownerUserId: `local-${Date.now()}`,
        ownerDisplayName: ownerName
      });

      session.setFamily(response.data.family);
      session.setMember(response.data.ownerMember);

      wx.hideLoading();
      wx.navigateTo({ url: "/pages/family/index" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "创建失败，请确认 API 已启动",
        icon: "none"
      });
    }
  },

  onOpenFamily() {
    const family = session.getFamily();

    if (!family) {
      wx.showToast({
        title: "请先创建或加入家庭",
        icon: "none"
      });
      return;
    }

    wx.navigateTo({ url: "/pages/family/index" });
  }
});
