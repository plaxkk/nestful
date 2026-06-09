import { api, type FamilyInvitation, type FamilyMember } from "../../utils/api";
import { session } from "../../utils/session";

const roleOptions: Array<{ label: string; value: FamilyMember["role"] }> = [
  { label: "管理员", value: "admin" },
  { label: "家人", value: "member" },
  { label: "长辈", value: "elder" },
  { label: "孩子", value: "child" },
  { label: "访客", value: "guest" }
];

const birthdayCalendarOptions: Array<{ label: string; value: "solar" | "lunar" }> = [
  { label: "阳历", value: "solar" },
  { label: "农历", value: "lunar" }
];

const roleLabel = (role: FamilyMember["role"]) => roleOptions.find((item) => item.value === role)?.label ?? "家人";

const statusLabel = (invitation: FamilyInvitation) => {
  if (invitation.status === "accepted") {
    return "已使用";
  }

  if (invitation.status === "canceled") {
    return "已撤销";
  }

  if (invitation.status === "expired") {
    return "已过期";
  }

  return "可使用";
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }

  const pad = (item: number) => item.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
};

const withAvatarText = (member: FamilyMember) => ({
  ...member,
  avatarText: member.displayName ? member.displayName.slice(0, 1) : "?",
  roleLabel: roleLabel(member.role),
  detailText: [member.birthday, member.location].filter(Boolean).join(" · ") || "点开补充资料"
});

const withInvitationText = (invitation: FamilyInvitation) => ({
  ...invitation,
  statusLabel: statusLabel(invitation),
  expiresAtText: invitation.expiresAt ? `到期：${formatDateTime(invitation.expiresAt)}` : "24 小时内有效",
  canCancel: invitation.status === "active"
});

Page({
  data: {
    familyName: "",
    members: [] as Array<FamilyMember & { avatarText: string; roleLabel: string; detailText: string }>,
    memberCountText: "0 位家人",
    inviteCode: "",
    inviteDigits: [] as string[],
    joinPath: "",
    invitations: [] as Array<
      FamilyInvitation & { statusLabel: string; expiresAtText: string; canCancel: boolean }
    >,
    loading: false,
    inviteMode: false,
    isCurrentMemberAdmin: false,
    roleOptions,
    birthdayCalendarOptions,
    memberEditorVisible: false,
    selectedMember: null as (FamilyMember & { avatarText: string; roleLabel: string; detailText: string }) | null,
    editDisplayNameInput: "",
    editRoleIndex: 1,
    editBirthdayInput: "",
    editBirthdayCalendarIndex: 0,
    editLocationInput: "",
    editEmergencyContactInput: "",
    canEditSelectedRole: false,
    canRemoveSelected: false,
    nextActions: [
      { title: "生日和健康", desc: "生日、吃药、运动都放这里", page: "reminders" },
      { title: "家庭活动", desc: "约吃饭、散步或视频聊天", page: "activities" },
      { title: "记忆墙", desc: "资料、账号说明和家庭记忆", page: "digital-space" },
      { title: "家庭账本", desc: "把家里的钱慢慢记清楚", page: "ledger" }
    ]
  },

  onShow() {
    void this.loadFamilyData();
  },

  async loadFamilyData() {
    await this.loadMembers();
    await this.loadInvitations();
  },

  async loadMembers() {
    const family = session.getFamily();
    const currentMember = session.getMember();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    this.setData({
      familyName: family.name,
      isCurrentMemberAdmin: Boolean(currentMember && currentMember.role === "admin"),
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

  async loadInvitations() {
    const family = session.getFamily();

    if (!family || !this.data.isCurrentMemberAdmin) {
      this.setData({ invitations: [] });
      return;
    }

    try {
      const response = await api.listInvitations(family.id);
      this.setData({
        invitations: response.data.map(withInvitationText)
      });
    } catch {
      this.setData({ invitations: [] });
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
      await this.loadInvitations();
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

  async onOpenMember(event: WechatMiniprogram.TouchEvent) {
    const family = session.getFamily();
    const currentMember = session.getMember();
    const memberId = event.currentTarget.dataset.id as string | undefined;
    const listedMember = this.data.members.find((item) => item.id === memberId);

    if (!family || !currentMember || !memberId) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    let openedFromList = false;

    if (listedMember) {
      openedFromList = true;
      this.openMemberEditor(listedMember, currentMember, true);
    }

    try {
      const response = await api.getMember(family.id, memberId);
      const member = withAvatarText(response.data);
      this.openMemberEditor(member, currentMember, !openedFromList);
    } catch {
      if (listedMember) {
        return;
      }

      wx.showToast({
        title: "资料打开失败，请稍后再试",
        icon: "none"
      });
    }
  },

  openMemberEditor(
    member: FamilyMember & { avatarText: string; roleLabel: string; detailText: string },
    currentMember: FamilyMember,
    shouldScroll = false,
  ) {
    const roleIndex = roleOptions.findIndex((item) => item.value === member.role);
    const calendarIndex = birthdayCalendarOptions.findIndex((item) => item.value === member.birthdayCalendar);

    this.setData(
      {
        memberEditorVisible: true,
        selectedMember: member,
        editDisplayNameInput: member.displayName,
        editRoleIndex: roleIndex >= 0 ? roleIndex : 1,
        editBirthdayInput: member.birthday ?? "",
        editBirthdayCalendarIndex: calendarIndex >= 0 ? calendarIndex : 0,
        editLocationInput: member.location ?? "",
        editEmergencyContactInput: member.emergencyContact ?? "",
        canEditSelectedRole: this.data.isCurrentMemberAdmin,
        canRemoveSelected: this.data.isCurrentMemberAdmin && member.id !== currentMember.id
      },
      () => {
        if (shouldScroll) {
          this.scrollToMemberEditor();
        }
      },
    );
  },

  scrollToMemberEditor() {
    wx.pageScrollTo({
      selector: ".member-editor",
      duration: 260
    });
  },

  onCloseMemberEditor() {
    this.setData({
      memberEditorVisible: false,
      selectedMember: null
    });
  },

  onEditDisplayNameInput(event: WechatMiniprogram.Input) {
    this.setData({ editDisplayNameInput: event.detail.value });
  },

  onEditBirthdayInput(event: WechatMiniprogram.Input) {
    this.setData({ editBirthdayInput: event.detail.value });
  },

  onEditLocationInput(event: WechatMiniprogram.Input) {
    this.setData({ editLocationInput: event.detail.value });
  },

  onEditEmergencyContactInput(event: WechatMiniprogram.Input) {
    this.setData({ editEmergencyContactInput: event.detail.value });
  },

  onEditRoleChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ editRoleIndex: Number(event.detail.value) });
  },

  onEditBirthdayCalendarChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ editBirthdayCalendarIndex: Number(event.detail.value) });
  },

  async onSaveMemberProfile() {
    const family = session.getFamily();
    const currentMember = session.getMember();
    const selectedMember = this.data.selectedMember;
    const displayName = this.data.editDisplayNameInput.trim();

    if (!family || !currentMember || !selectedMember) {
      wx.showToast({
        title: "请先选择家人",
        icon: "none"
      });
      return;
    }

    if (!displayName) {
      wx.showToast({
        title: "请填写称呼",
        icon: "none"
      });
      return;
    }

    wx.showLoading({ title: "保存中" });

    try {
      const response = await api.updateMember(family.id, selectedMember.id, {
        displayName,
        role: this.data.canEditSelectedRole ? roleOptions[this.data.editRoleIndex]?.value : undefined,
        birthday: this.data.editBirthdayInput.trim(),
        birthdayCalendar: birthdayCalendarOptions[this.data.editBirthdayCalendarIndex]?.value,
        location: this.data.editLocationInput.trim(),
        emergencyContact: this.data.editEmergencyContactInput.trim()
      });

      if (response.data.id === currentMember.id) {
        session.setMember(response.data);
      }

      wx.hideLoading();
      this.setData({
        memberEditorVisible: false,
        selectedMember: null
      });
      await this.loadFamilyData();
      wx.showToast({
        title: "资料已保存",
        icon: "success"
      });
    } catch {
      wx.hideLoading();
      wx.showToast({
        title: "保存失败，请稍后再试",
        icon: "none"
      });
    }
  },

  async onRemoveSelectedMember() {
    const family = session.getFamily();
    const selectedMember = this.data.selectedMember;

    if (!family || !selectedMember || !this.data.canRemoveSelected) {
      wx.showToast({
        title: "不能移除这位家人",
        icon: "none"
      });
      return;
    }

    wx.showModal({
      title: "移除家人",
      content: `确定把${selectedMember.displayName}移出这个家庭吗？`,
      confirmText: "移除",
      success: async (result) => {
        if (!result.confirm) {
          return;
        }

        wx.showLoading({ title: "处理中" });

        try {
          await api.removeMember(family.id, selectedMember.id);
          wx.hideLoading();
          this.setData({
            memberEditorVisible: false,
            selectedMember: null
          });
          await this.loadFamilyData();
          wx.showToast({
            title: "已移除",
            icon: "success"
          });
        } catch {
          wx.hideLoading();
          wx.showToast({
            title: "移除失败，请稍后再试",
            icon: "none"
          });
        }
      }
    });
  },

  async onCancelInvitation(event: WechatMiniprogram.TouchEvent) {
    const family = session.getFamily();
    const invitationId = event.currentTarget.dataset.id as string | undefined;

    if (!family || !invitationId) {
      return;
    }

    try {
      await api.cancelInvitation(family.id, invitationId);
      await this.loadInvitations();
      wx.showToast({
        title: "邀请已撤销",
        icon: "success"
      });
    } catch {
      wx.showToast({
        title: "撤销失败，请稍后再试",
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
