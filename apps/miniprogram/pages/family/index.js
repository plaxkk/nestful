const { api } = require("../../utils/api");
const { session } = require("../../utils/session");

const withAvatarText = (member) => ({
  ...member,
  avatarText: member.displayName ? member.displayName.slice(0, 1) : "?",
  roleLabel: member.role === "admin" ? "管理员" : "家人",
});

Page({
  data: {
    familyName: "",
    members: [],
    inviteCode: "",
    joinPath: "",
    loading: false,
  },

  onShow() {
    this.loadMembers();
  },

  async loadMembers() {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    this.setData({
      familyName: family.name,
      loading: true,
    });

    try {
      const response = await api.listMembers(family.id);
      this.setData({
        members: response.data.map(withAvatarText),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error instanceof Error && error.message.includes("status 404")) {
        session.clear();
        wx.showToast({
          title: "家庭记录已失效，请重新创建",
          icon: "none",
        });
        wx.redirectTo({ url: "/pages/home/index" });
        return;
      }
      wx.showToast({
        title: "成员加载失败，请确认 API 已启动",
        icon: "none",
      });
    }
  },

  async onCreateInvitation() {
    const family = session.getFamily();
    const member = session.getMember();

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none",
      });
      return;
    }

    wx.showLoading({ title: "生成中" });

    try {
      const response = await api.createInvitation(family.id, {
        createdByMemberId: member.id,
        role: "member",
      });

      wx.hideLoading();
      this.setData({
        inviteCode: response.data.invitation.code,
        joinPath: response.data.joinPath,
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "邀请生成失败",
        icon: "none",
      });
    }
  },

  onOpenReminders() {
    wx.navigateTo({ url: "/pages/reminders/index" });
  },

  onOpenLedger() {
    wx.navigateTo({ url: "/pages/ledger/index" });
  },

  onOpenDigitalSpace() {
    wx.navigateTo({ url: "/pages/digital-space/index" });
  },

  onOpenActivities() {
    wx.navigateTo({ url: "/pages/activities/index" });
  },

  onShareAppMessage() {
    return {
      title: `加入${this.data.familyName}`,
      path: this.data.joinPath || "/pages/home/index",
    };
  },
});
