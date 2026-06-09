const { api } = require("../../utils/api");
const { session } = require("../../utils/session");
const { getWechatIdentity } = require("../../utils/wechat");

Page({
  data: {
    code: "",
    codeInput: "",
    displayName: "",
    invitationStatus: "待验证",
  },

  onLoad(query) {
    const code = query.code || "";

    this.setData({ code, codeInput: code });

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

  onCodeInput(event) {
    this.setData({
      codeInput: event.detail.value,
      code: event.detail.value.trim(),
      invitationStatus: event.detail.value.trim() ? "待验证" : "缺少邀请码",
    });
  },

  onCheckInvitation() {
    const code = this.data.codeInput.trim();

    if (!code) {
      this.setData({
        invitationStatus: "缺少邀请码",
      });
      return;
    }

    this.setData({ code });
    this.loadInvitation(code);
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

    const code = this.data.codeInput.trim() || this.data.code;

    if (!code) {
      wx.showToast({
        title: "请先输入邀请码",
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
      const identity = await getWechatIdentity();
      const response = await api.acceptInvitation(code, {
        displayName,
        userId: identity.userId,
        wechatOpenId: identity.wechatOpenId,
      });

      wx.hideLoading();
      session.setMember(response.data.member);
      session.setMembers(response.data.member.familyId, [response.data.member]);

      try {
        const familyResponse = await api.getFamily(response.data.member.familyId);
        session.setFamily(familyResponse.data);
      } catch {
        session.setFamily({
          id: response.data.member.familyId,
          name: "我的家庭",
          ownerUserId: "",
          createdAt: "",
        });
      }

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
