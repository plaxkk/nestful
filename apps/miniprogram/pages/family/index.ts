import { api, type FamilyMember } from "../../utils/api";
import { session } from "../../utils/session";

const withAvatarText = (member: FamilyMember) => ({
  ...member,
  avatarText: member.displayName ? member.displayName.slice(0, 1) : "?",
  roleLabel: member.role === "admin" ? "管理员" : "家人"
});

Page({
  data: {
    familyName: "",
    members: [] as FamilyMember[],
    memberCountText: "0 位家人",
    inviteCode: "",
    inviteDigits: [] as string[],
    joinPath: "",
    loading: false,
    inviteMode: false,
    nextActions: [
      { title: "生日和健康", desc: "生日、吃药、运动都放这里", page: "reminders" },
      { title: "家庭活动", desc: "约吃饭、散步或视频聊天", page: "activities" },
      { title: "记忆墙", desc: "资料、账号说明和家庭记忆", page: "digital-space" },
      { title: "家庭账本", desc: "把家里的钱慢慢记清楚", page: "ledger" }
    ]
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
        members: response.data.map(withAvatarText),
        memberCountText: `${response.data.length} 位家人`,
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error instanceof Error && error.message.includes("status 404")) {
        session.clear();
        wx.showToast({
          title: "家庭记录已失效，请重新创建",
          icon: "none"
        });
        wx.redirectTo({ url: "/pages/home/index" });
        return;
      }
      wx.showToast({
        title: "成员加载失败，请确认 API 已启动",
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
        inviteDigits: response.data.invitation.code.split(""),
        joinPath: response.data.joinPath
      });
    } catch (error) {
      wx.hideLoading();
      if (error instanceof Error && error.message.includes("status 404")) {
        session.clear();
        wx.showToast({
          title: "家庭记录已失效，请重新创建",
          icon: "none"
        });
        wx.redirectTo({ url: "/pages/home/index" });
        return;
      }
      wx.showToast({
        title: "邀请生成失败，请稍后再试",
        icon: "none"
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

  onOpenFeature(event: WechatMiniprogram.BaseEvent) {
    const page = event.currentTarget.dataset.page as string;
    const routes: Record<string, string> = {
      reminders: "/pages/reminders/index",
      activities: "/pages/activities/index",
      "digital-space": "/pages/digital-space/index",
      ledger: "/pages/ledger/index"
    };

    if (routes[page]) {
      wx.navigateTo({ url: routes[page] });
    }
  },

  onCopyInviteCode() {
    if (!this.data.inviteCode) {
      wx.showToast({
        title: "请先生成邀请码",
        icon: "none"
      });
      return;
    }

    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => {
        wx.showToast({
          title: "邀请码已复制",
          icon: "success"
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: `加入${this.data.familyName}`,
      path: this.data.joinPath || "/pages/home/index"
    };
  }
});
