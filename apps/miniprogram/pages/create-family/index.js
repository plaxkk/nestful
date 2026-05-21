const { api } = require("../../utils/api");
const { session } = require("../../utils/session");

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
      const response = await api.createFamily({
        name: familyName,
        ownerUserId: `local-${Date.now()}`,
        ownerDisplayName: "我",
      });

      session.setFamily(response.data.family);
      session.setMember(response.data.ownerMember);

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
