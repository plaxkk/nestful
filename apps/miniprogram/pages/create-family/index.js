const { api } = require("../../utils/api");
const { session } = require("../../utils/session");
const { getWechatIdentity } = require("../../utils/wechat");

Page({
  data: {
    familyNameInput: "我的家庭",
  },

  onFamilyNameInput(event) {
    this.setData({
      familyNameInput: event.detail.value,
    });
  },

  onBack() {
    wx.navigateBack();
  },

  async onCreateFamily() {
    const familyName = this.data.familyNameInput.trim();

    if (!familyName) {
      wx.showToast({
        title: "请先写家庭名字",
        icon: "none",
      });
      return;
    }

    wx.showLoading({ title: "创建中" });

    try {
      const identity = await getWechatIdentity();
      const user = session.getUser();
      const ownerDisplayName = user && user.nickname !== "微信用户" ? user.nickname : "家庭管理员";
      const response = await api.createFamily({
        name: familyName,
        ownerUserId: identity.userId,
        ownerWechatOpenId: identity.wechatOpenId,
        ownerDisplayName,
      });

      session.setFamily(response.data.family);
      session.setMember(response.data.ownerMember);
      session.setMembers(response.data.family.id, [response.data.ownerMember]);

      wx.hideLoading();
      wx.redirectTo({ url: "/pages/family/index?welcome=1" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "创建失败，请确认 API 已启动",
        icon: "none",
      });
    }
  },
});
