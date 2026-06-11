const { api } = require("../../utils/api");
const { session } = require("../../utils/session");
const { getWechatIdentity } = require("../../utils/wechat");

const homeRefreshIntervalMs = 30 * 1000;

Page({
  data: {
    hasFamily: false,
    primaryText: "创建我的家庭",
    restoring: false,
    lastRestoredAt: 0,
  },

  onShow() {
    this.syncHomeState();
    void this.restoreFamilySession();
  },

  syncHomeState() {
    const hasFamily = Boolean(session.getFamily());
    this.setData({
      hasFamily,
      primaryText: hasFamily ? "打开我的家庭" : "创建我的家庭",
    });
  },

  async restoreFamilySession() {
    if (this.data.restoring) {
      return;
    }

    if (this.data.lastRestoredAt > 0 && Date.now() - this.data.lastRestoredAt < homeRefreshIntervalMs) {
      return;
    }

    this.setData({ restoring: true });

    try {
      await getWechatIdentity();
      const response = await api.listMyFamilies();
      const membership = response.data[0];

      if (!membership) {
        this.syncHomeState();
        this.setData({
          restoring: false,
          lastRestoredAt: Date.now(),
        });
        return;
      }

      session.setFamily(membership.family);
      session.setMember(membership.member);
      session.setMembers(membership.family.id, membership.members);
      this.setData({
        hasFamily: true,
        primaryText: "打开我的家庭",
        restoring: false,
        lastRestoredAt: Date.now(),
      });
    } catch {
      this.syncHomeState();
      this.setData({ restoring: false });
    }
  },

  onPrimaryAction() {
    if (this.data.hasFamily) {
      wx.navigateTo({ url: "/pages/family/index" });
      return;
    }

    wx.navigateTo({ url: "/pages/create-family/index" });
  },

  onJoinFamily() {
    wx.navigateTo({ url: "/pages/join/index" });
  },
});
