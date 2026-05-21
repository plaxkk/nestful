const { api } = require("../../utils/api");
const { session } = require("../../utils/session");

Page({
  data: {
    code: "",
    displayName: "",
    invitationStatus: "待验证",
  },

  onLoad(query) {
    const code = query.code || "";

    this.setData({ code });

    if (code) {
      this.loadInvitation(code);
    } else {
      this.setData({
        invitationStatus: "缺少邀请码",
      });
    }
  },

  onDisplayNameInput(event) {
    this.setData({
      displayName: event.detail.value,
    });
  },

  async loadInvitation(code) {
    try {
      const response = await api.getInvitation(code);
      this.setData({
        invitationStatus: response.data.acceptedAt ? "邀请已使用" : "邀请有效",
      });
    } catch (error) {
      this.setData({
        invitationStatus: "邀请无效",
      });
    }
  },

  async onJoinFamily() {
    const displayName = this.data.displayName.trim();

    if (!this.data.code) {
      wx.showToast({
        title: "邀请链接不完整，请让家人重新发送",
        icon: "none",
      });
      return;
    }

    if (!displayName) {
      wx.showToast({
        title: "请填写称呼",
        icon: "none",
      });
      return;
    }

    wx.showLoading({ title: "加入中" });

    try {
      const response = await api.acceptInvitation(this.data.code, {
        displayName,
        userId: `local-${Date.now()}`,
      });

      wx.hideLoading();
      session.setMember(response.data.member);
      session.setFamily({
        id: response.data.member.familyId,
        name: "我的家庭",
        ownerUserId: "",
        createdAt: "",
      });

      wx.redirectTo({ url: "/pages/family/index" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "加入失败，请让家人重新发送邀请",
        icon: "none",
      });
    }
  },
});
