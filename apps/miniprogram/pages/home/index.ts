import { session } from "../../utils/session";

Page({
  data: {
    hasFamily: false,
    primaryText: "创建我的家庭"
  },

  onShow() {
    const hasFamily = Boolean(session.getFamily());
    this.setData({
      hasFamily,
      primaryText: hasFamily ? "打开我的家庭" : "创建我的家庭"
    });
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
