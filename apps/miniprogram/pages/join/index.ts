import { api } from "../../utils/api";
import { session } from "../../utils/session";

Page({
  data: {
    code: "",
    displayName: "",
    invitationStatus: "待验证"
  },

  onLoad(query: Record<string, string | undefined>) {
    const code = query.code ?? "";

    this.setData({ code });

    if (code) {
      void this.loadInvitation(code);
    }
  },

  onDisplayNameInput(event: WechatMiniprogram.Input) {
    this.setData({
      displayName: event.detail.value
    });
  },

  async loadInvitation(code: string) {
    try {
      const response = await api.getInvitation(code);
      this.setData({
        invitationStatus: response.data.acceptedAt ? "邀请已使用" : "邀请有效"
      });
    } catch (error) {
      this.setData({
        invitationStatus: "邀请无效"
      });
    }
  },

  async onJoinFamily() {
    const displayName = this.data.displayName.trim();

    if (!this.data.code || !displayName) {
      wx.showToast({
        title: "请填写称呼",
        icon: "none"
      });
      return;
    }

    wx.showLoading({ title: "加入中" });

    try {
      const response = await api.acceptInvitation(this.data.code, {
        displayName,
        userId: `local-${Date.now()}`
      });

      wx.hideLoading();
      session.setMember(response.data.member);

      const family = {
        id: response.data.member.familyId,
        name: "我的家庭",
        ownerUserId: "",
        createdAt: ""
      };
      session.setFamily(family);

      wx.redirectTo({ url: "/pages/family/index" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "加入失败，请检查邀请",
        icon: "none"
      });
    }
  }
});
