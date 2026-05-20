import { api, type FamilyMember } from "../../utils/api";
import { session } from "../../utils/session";

Page({
  data: {
    familyName: "",
    members: [] as FamilyMember[],
    inviteCode: "",
    joinPath: "",
    loading: false
  },

  onShow() {
    void this.loadMembers();
  },

  async loadMembers() {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    this.setData({
      familyName: family.name,
      loading: true
    });

    try {
      const response = await api.listMembers(family.id);
      this.setData({
        members: response.data,
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: "成员加载失败",
        icon: "none"
      });
    }
  },

  async onCreateInvitation() {
    const family = session.getFamily();
    const member = session.getMember();

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    wx.showLoading({ title: "生成中" });

    try {
      const response = await api.createInvitation(family.id, {
        createdByMemberId: member.id,
        role: "member"
      });

      wx.hideLoading();
      this.setData({
        inviteCode: response.data.invitation.code,
        joinPath: response.data.joinPath
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "邀请生成失败",
        icon: "none"
      });
    }
  },

  onShareAppMessage() {
    return {
      title: `加入${this.data.familyName}`,
      path: this.data.joinPath || "/pages/home/index"
    };
  }
});
