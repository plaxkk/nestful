import { api } from "../../utils/api";
import { session } from "../../utils/session";
import { getWechatIdentity } from "../../utils/wechat";

Page({
  data: {
    hasFamily: false,
    primaryText: "创建我的家庭"
  },

  onShow() {
    this.syncHomeState();
    void this.restoreFamilySession();
  },

  syncHomeState() {
    const hasFamily = Boolean(session.getFamily());
    this.setData({
      hasFamily,
      primaryText: hasFamily ? "打开我的家庭" : "创建我的家庭"
    });
  },

  async restoreFamilySession() {
    try {
      await getWechatIdentity();
      const response = await api.listMyFamilies();
      const membership = response.data[0];

      if (!membership) {
        this.syncHomeState();
        return;
      }

      session.setFamily(membership.family);
      session.setMember(membership.member);
      session.setMembers(membership.family.id, membership.members);
      this.setData({
        hasFamily: true,
        primaryText: "打开我的家庭"
      });
    } catch {
      this.syncHomeState();
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
  }
});
