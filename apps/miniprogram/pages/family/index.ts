import { api, ApiRequestError, errorMessage, type FamilyInvitation, type FamilyMember, type DashboardItem, type JoinRequest } from "../../utils/api";
import { session } from "../../utils/session";

const roleOptions: Array<{ label: string; value: FamilyMember["role"] }> = [
  { label: "管理员", value: "admin" },
  { label: "家人", value: "member" }
];

const birthdayCalendarOptions: Array<{ label: string; value: "solar" | "lunar" }> = [
  { label: "阳历", value: "solar" },
  { label: "农历", value: "lunar" }
];
const identityTagOptions = [
  { label: "不设置", value: null },
  { label: "长辈", value: "elder" },
  { label: "孩子", value: "child" },
  { label: "访客", value: "guest" }
] as const;

const pageRefreshIntervalMs = 30 * 1000;

type LoadOptions = {
  force?: boolean;
  showLoading?: boolean;
};

const roleLabel = (role: FamilyMember["role"]) => roleOptions.find((item) => item.value === role)?.label ?? "家人";

const statusLabel = (invitation: FamilyInvitation) => {
  if(invitation.status==='full')return '人数已满';
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

const displayNameFor = (member: FamilyMember) => {
  const displayName = member.displayName.trim();

  if (displayName && displayName !== "我") {
    return displayName;
  }

  return member.role === "admin" ? "家庭管理员" : "家人";
};

const withAvatarText = (member: FamilyMember) => ({
  ...member,
  displayName: displayNameFor(member),
  avatarText: displayNameFor(member).slice(0, 1),
  roleLabel: roleLabel(member.role),
  detailText: [member.birthday, member.location].filter(Boolean).join(" · ") || "点开补充资料"
});

const withInvitationText = (invitation: FamilyInvitation) => ({
  ...invitation,
  statusLabel: statusLabel(invitation),
  modeLabel: invitation.mode==='group'?`群邀请 · 已加入 ${invitation.useCount??0}/${invitation.maxUses??20} 人`:'单人邀请',
  expiresAtText: invitation.expiresAt ? `到期：${formatDateTime(invitation.expiresAt)}` : "24 小时内有效",
  canCancel: invitation.status === "active" || invitation.status === "full"
});

const memberSnapshotFor = (familyId: string, currentMember: FamilyMember | "") => {
  const cachedMembers = session.getMembers(familyId);

  if (cachedMembers.length > 0) {
    return cachedMembers;
  }

  return currentMember && currentMember.familyId === familyId ? [currentMember] : [];
};

Page({
  data: {
    todayDate:formatDateTime(new Date().toISOString()).slice(0,10),error:"",busy:false,inviteFormVisible:false,invitationHistoryVisible:false,settingsVisible:false,
    invitationModeIndex:1,
    invitationModeOptions:['单独邀请一人（24 小时）','家庭群邀请（7 天，最多 20 人）'],
    approvalRequired:true,
    activeInvitationId:'',
    invitationExpiry:'',
    joinRequests:[] as JoinRequest[],
    todos:[] as Array<DashboardItem & {label:string;page:string;timeText:string}>,
    upcoming:[] as Array<DashboardItem & {timeText:string}>,
    dashboardError:'',
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
    refreshing: false,
    lastLoadedAt: 0,
    currentFamilyId: "",
    inviteMode: false,
    isCurrentMemberAdmin: false,
    roleOptions,
    birthdayCalendarOptions,
    identityTagOptions,
    editIdentityTagIndex: 0,
    editBirthdayLeapMonth: false,
    memberEditorVisible: false,
    selectedMember: null as (FamilyMember & { avatarText: string; roleLabel: string; detailText: string }) | null,
    editDisplayNameInput: "",
    editRoleIndex: 1,
    editBirthdayInput: "",
    editBirthdayCalendarIndex: 0,
    editLocationInput: "",
    editEmergencyContactInput: "",
    canEditSelectedRole: false,
    canEditSelectedProfile:false,
    canRemoveSelected: false,
    nextActions: [
      { title: "生日和健康", desc: "生日、吃药、运动都放这里", page: "reminders" },
      { title: "家庭账本", desc: "把家里的钱慢慢记清楚", page: "ledger" }
    ]
  },

  onShow() {
    this.setData({memberEditorVisible:false,selectedMember:null,editEmergencyContactInput:''});
    void this.loadFamilyData({force:true,showLoading:false});
  },

  onRetry(){void this.loadFamilyData({force:true,showLoading:true});},
  onToggleInvite(){this.setData({inviteFormVisible:!this.data.inviteFormVisible},()=>{if(this.data.inviteFormVisible)wx.pageScrollTo({selector:this.data.inviteCode?".invite-card":".invite-form",duration:200});});},
  onToggleHistory(){this.setData({invitationHistoryVisible:!this.data.invitationHistoryVisible});},
  onToggleSettings(){this.setData({settingsVisible:!this.data.settingsVisible});},
  onClearBirthday(){this.setData({editBirthdayInput:""});},
  onEditBirthdayDateChange(e:WechatMiniprogram.PickerChange){this.setData({editBirthdayInput:String(e.detail.value)});},
  onOpenFamilyList() {
    wx.reLaunch({ url: "/pages/home/index?switch=1" });
  },

  async loadFamilyData(options: LoadOptions = {}) {
    const family = session.getFamily();
    const currentMember = session.getMember();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    if (
      !options.force &&
      this.data.currentFamilyId === family.id &&
      this.data.lastLoadedAt > 0 &&
      Date.now() - this.data.lastLoadedAt < pageRefreshIntervalMs
    ) {
      return;
    }

    if (this.data.refreshing && !options.force) {
      return;
    }

    const members = memberSnapshotFor(family.id, currentMember);
    const isCurrentMemberAdmin = Boolean(currentMember && currentMember.role === "admin");
    const hasRenderedFamily = this.data.currentFamilyId === family.id && this.data.members.length > 0;

    this.setData({
      ...(this.data.currentFamilyId !== family.id ? { inviteFormVisible:false,invitationHistoryVisible:false,settingsVisible:false,inviteCode: "", inviteDigits: [], joinPath: "", activeInvitationId: "", invitations: [], joinRequests: [] } : {}),
      currentFamilyId: family.id,
      familyName: family.name,
      isCurrentMemberAdmin,
      ...(hasRenderedFamily
        ? {}
        : {
            members: members.map(withAvatarText),
            memberCountText: `${members.length} 位家人`
          }),
      invitations: isCurrentMemberAdmin && this.data.currentFamilyId === family.id ? this.data.invitations : [],
      refreshing: true,error:""
    });

    await Promise.all([this.loadMembers({ showLoading: options.showLoading }), this.loadInvitations(), this.loadJoinRequests()]);
    this.setData({
      lastLoadedAt: Date.now(),
      refreshing: false
    });
  },

  async loadMembers(options: LoadOptions = {}) {
    const family = session.getFamily();
    const currentMember = session.getMember();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    const shouldShowLoading = options.showLoading ?? this.data.members.length === 0;

    this.setData({
      familyName: family.name,
      isCurrentMemberAdmin: Boolean(currentMember && currentMember.role === "admin"),
      loading: shouldShowLoading
    });

    try {
      const response = await api.listMembers(family.id);
      if(!session.isFamily(family.id))return;
      session.setMembers(family.id, response.data);
      const fresh=response.data.find(m=>currentMember&&m.id===currentMember.id);
      if(fresh)session.setMember(fresh);
      this.setData({
        isCurrentMemberAdmin:Boolean(fresh&&fresh.role==='admin'),
        members: response.data.map(withAvatarText),
        memberCountText: `${response.data.length} 位家人`,
        loading: false
      });
    } catch (error) {
      if (!session.isFamily(family.id)) return;
      this.setData({ loading: false, refreshing: false,error:"家人资料暂时加载失败，请检查网络后重试。" });
      if (error instanceof ApiRequestError && [401,403,404].includes(error.statusCode)) {
        session.clearFamily();
        this.setData({members:[],todos:[],upcoming:[],joinRequests:[],invitations:[],inviteCode:'',joinPath:'',memberEditorVisible:false,selectedMember:null});
        wx.showToast({
          title: "已无法访问这个家庭，请重新选择",
          icon: "none"
        });
        wx.redirectTo({ url: "/pages/home/index" });
        return;
      }
      wx.showToast({
        title: "成员加载失败，请检查网络后重试",
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
      if(!session.isFamily(family.id))return;
      this.setData({
        invitations: response.data.map(withInvitationText)
      });
    } catch {
      this.setData({ invitations: [] });
    }
  },

  async onCreateInvitation() {
    if(this.data.busy)return;
    const family = session.getFamily();
    const member = session.getMember();

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    this.setData({busy:true});
    wx.showLoading({ title: "生成中" });

    try {
      const response = await api.createInvitation(family.id, {
        createdByMemberId: member.id,
        role: "member",
        mode:this.data.invitationModeIndex===1?'group':'single',
        requiresApproval:this.data.invitationModeIndex===1&&this.data.approvalRequired
      });
      wx.hideLoading();
      if (!session.isFamily(family.id)) return;
      this.setData({
        inviteCode: response.data.invitation.code,
        activeInvitationId:response.data.invitation.id,
        invitationExpiry:formatDateTime(response.data.invitation.expiresAt),
        inviteDigits: response.data.invitation.code.split(""),
        joinPath: response.data.joinPath
      });
      this.setData({ lastLoadedAt: 0 });
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
    } finally{this.setData({busy:false});}
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
        editIdentityTagIndex: Math.max(0, identityTagOptions.findIndex(item => item.value === member.identityTag)),
        editBirthdayLeapMonth: Boolean(member.birthdayLeapMonth),
        editLocationInput: member.location ?? "",
        editEmergencyContactInput: member.emergencyContact ?? "",
        canEditSelectedRole: this.data.isCurrentMemberAdmin,
        canEditSelectedProfile:this.data.isCurrentMemberAdmin||member.id===currentMember.id,
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
  onEditIdentityTagChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ editIdentityTagIndex: Number(event.detail.value) });
  },
  onEditBirthdayLeapMonthChange(event: WechatMiniprogram.SwitchChange) {
    this.setData({ editBirthdayLeapMonth: event.detail.value });
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
        version: selectedMember.version,
        displayName,
        role: this.data.canEditSelectedRole ? roleOptions[this.data.editRoleIndex]?.value : undefined,
        birthday: this.data.editBirthdayInput.trim(),
        birthdayCalendar: birthdayCalendarOptions[this.data.editBirthdayCalendarIndex]?.value,
        birthdayLeapMonth: this.data.editBirthdayCalendarIndex === 1 && this.data.editBirthdayLeapMonth,
        identityTag: identityTagOptions[this.data.editIdentityTagIndex]?.value ?? null,
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
      await this.loadFamilyData({ force: true, showLoading: false });
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
          await api.removeMember(family.id, selectedMember.id, selectedMember.version);
          wx.hideLoading();
          this.setData({
            memberEditorVisible: false,
            selectedMember: null
          });
          await this.loadFamilyData({ force: true, showLoading: false });
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
      if(invitationId===this.data.activeInvitationId)this.setData({inviteCode:'',joinPath:'',activeInvitationId:''});
      this.setData({ lastLoadedAt: 0 });
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
  onInvitationModeChange(e:WechatMiniprogram.PickerChange){this.setData({invitationModeIndex:Number(e.detail.value)});},
  onApprovalChange(e:WechatMiniprogram.SwitchChange){this.setData({approvalRequired:e.detail.value});},
  onNewInvitation(){this.setData({inviteCode:'',joinPath:'',activeInvitationId:''});},
  async loadDashboard(){
    const family=session.getFamily();if(!family)return;
    try{
      const d=(await api.getDashboard(family.id)).data;
      if(!session.isFamily(family.id))return;
      const item=(r:DashboardItem,label:string,page:string)=>({...r,label,page,timeText:formatDateTime(r.at)});
      this.setData({dashboardError:'',todos:[...d.activities.map(r=>item(r,'待我回应','activities')),...d.tasks.map(r=>item(r,'待我完成','activities')),...d.reminders.map(r=>item(r,'我的提醒','reminders'))],upcoming:d.upcoming.map(r=>({...r,timeText:formatDateTime(r.at)}))});
    }catch{this.setData({dashboardError:'待办暂时加载失败，请重试',todos:[],upcoming:[]});}
  },
  async loadJoinRequests(){
    const family=session.getFamily(),member=session.getMember();if(!family||!member||member.role!=='admin'){this.setData({joinRequests:[]});return;}
    try{const r=await api.listJoinRequests(family.id);if(session.isFamily(family.id))this.setData({joinRequests:r.data});}
    catch{this.setData({joinRequests:[]});}
  },
  onRefreshDashboard(){void this.loadFamilyData({force:true,showLoading:false});},
  onOpenTodo(e:WechatMiniprogram.TouchEvent){
    const family=session.getFamily();if(!family)return;
    const page=e.currentTarget.dataset.page as string;
    const id=e.currentTarget.dataset.activityId||e.currentTarget.dataset.id;
    wx.navigateTo({url:page==='reminders'?'/pages/reminders/index':`/pages/activities/index?familyId=${family.id}&activityId=${id}`});
  },
  async onDecideJoin(e:WechatMiniprogram.TouchEvent){
    const family=session.getFamily();if(!family||this.data.busy)return;
    this.setData({busy:true});
    try{await api.decideJoinRequest(family.id,String(e.currentTarget.dataset.id),e.currentTarget.dataset.decision as 'approved'|'rejected');await this.loadFamilyData({force:true,showLoading:false});wx.showToast({title:'申请已处理',icon:'none'});}
    catch(error){wx.showToast({title:errorMessage(error),icon:'none'});}
    finally{this.setData({busy:false});}
  },
  onOpenHelp(){wx.navigateTo({url:'/pages/help/index'});},
  async onRenameFamily(){
    const family=session.getFamily();if(!family||this.data.busy)return;
    const result=await wx.showModal({title:'修改家庭名称',editable:true,placeholderText:family.name});if(!result.confirm||!result.content?.trim())return;
    this.setData({busy:true});
    try{const fresh=(await api.getFamily(family.id)).data;const updated=(await api.renameFamily(family.id,result.content.trim(),fresh.version)).data;session.setFamily(updated);this.setData({familyName:updated.name});}
    catch(error){wx.showToast({title:errorMessage(error),icon:'none'});}finally{this.setData({busy:false});}
  },
  async onLeaveFamily(){
    const family=session.getFamily(),member=session.getMember();if(!family||!member||this.data.busy)return;
    const result=await wx.showModal({title:'退出这个家庭？',content:'退出后不能查看家庭内容。管理员请先将另一位家人设为管理员；以后需要新的邀请才能重新加入。'});if(!result.confirm)return;
    this.setData({busy:true});
    try{const fresh=(await api.getMember(family.id,member.id)).data;await api.removeMember(family.id,member.id,fresh.version);session.clearFamily();wx.reLaunch({url:'/pages/home/index'});}
    catch(error){wx.showToast({title:errorMessage(error),icon:'none'});}
    finally{this.setData({busy:false});}
  },
  async onArchiveFamily(){
    const family=session.getFamily();if(!family||this.data.busy)return;
    const result=await wx.showModal({title:'归档整个家庭？',content:'所有家人将无法继续访问，邀请和提醒会停止。资料保留，不会永久删除；恢复请通过意见反馈联系。'});if(!result.confirm)return;
    this.setData({busy:true});
    try{const fresh=(await api.getFamily(family.id)).data;await api.archiveFamily(family.id,fresh.version);session.clearFamily();wx.reLaunch({url:'/pages/home/index'});}
    catch(error){wx.showToast({title:errorMessage(error),icon:'none'});}
    finally{this.setData({busy:false});}
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
      path: this.data.joinPath || "/pages/home/index",
      imageUrl:'/assets/share-family.png'
    };
  }
});
