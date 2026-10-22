import { api, ApiRequestError, errorMessage, type Activity, type DashboardItem, type FamilyMembership, type FamilyDashboard, type RsvpStatus } from "../../utils/api";
import { session } from "../../utils/session";
import { publicProductShare } from "../../utils/discovery";
import { openFamilyPage } from "../../utils/navigation";

const refreshIntervalMs = 30_000;
const dateText = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "时间待确认";
  const today = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((day - now) / 86400000);
  const prefix = diff === 0 ? "今天" : diff === 1 ? "明天" : `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return `${prefix} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
type HomeItem = DashboardItem & { key: string; label: string; timeText: string; page: string; kind: string };
type HomeFamily = FamilyMembership & { id: string; initial: string };
type Hero = DashboardItem & { timeText: string; location: string; responseText: string; actionText: string; needsResponse: boolean };
const emptyContent = () => ({ hero: null as Hero | null, todos: [] as HomeItem[], reminders: [] as HomeItem[], pendingCount: 0, moreTodoCount: 0, joinRequestCount: 0, upcomingItems: [] as HomeItem[], pendingReminderCount: 0, pendingActivityCount: 0 });

Page({
  data: {
    ...emptyContent(), hasFamily: false, primaryText: "创建我的家庭", familyName: "", memberCount: 0,
    families: [] as HomeFamily[], currentFamilyId: "", primaryFamilyId: "", restoring: false,
    lastRestoredAt: 0, loading: false, error: "", familyListError: "", switcherVisible: false,
    busy: false, busyTaskId: "", dateLabel: "", perfText: ""
  },
  restoreEpoch: 0,
  contentEpoch: 0,
  loadedRevision: -1,
  loadedUserId: "",
  skipInitialRestore: false,
  preferPrimary: true,
  openSwitcherOnRestore: false,
  startupAt: 0,
  requestMs: 0,
  showPerf: false,
  perfReported: false,
  onLoad(query: Record<string, string | undefined>) {
    // Develop builds (including previews) show one startup badge so a phone can
    // report first-screen time without attaching a debugger.
    this.startupAt = Date.now();
    try { this.showPerf = wx.getAccountInfoSync().miniProgram.envVersion === "develop"; } catch { this.showPerf = false; }
    this.skipInitialRestore = query.loggedOut === "1";
    this.openSwitcherOnRestore = query.switch === "1";
    // Explicit switching from management preserves the family being viewed.
    this.preferPrimary = !this.openSwitcherOnRestore && query.current !== "1";
  },
  onShow() {
    this.restoreEpoch++;
    const today = new Date();
    this.setData({ dateLabel: `${today.getMonth() + 1} 月 ${today.getDate()} 日 · 星期${"日一二三四五六"[today.getDay()]}` });
    this.syncHomeState();
    if (!this.skipInitialRestore) void this.restoreFamilySession();
  },
  onHide() {
    this.restoreEpoch++;
    this.setData({ restoring: false, loading: false, switcherVisible: false });
  },
  onUnload() { this.restoreEpoch++; },
  async onPullDownRefresh() {
    try { await this.restoreFamilySession(true); } finally { wx.stopPullDownRefresh(); }
  },
  syncHomeState() {
    const family = session.getFamily(), member = session.getMember();
    const hasFamily = Boolean(family && member && member.familyId === family.id);
    const changed = this.data.currentFamilyId !== (hasFamily && family ? family.id : "");
    const families = [...this.data.families];
    if (hasFamily && family && member && !families.some(item => item.family.id === family.id)) {
      families.unshift({ id: family.id, initial: family.name.slice(0, 1), family, member, members: session.getMembers(family.id) });
    }
    this.setData({
      ...(changed ? emptyContent() : {}), hasFamily, families: hasFamily ? families : [],
      familyName: hasFamily && family ? family.name : "",
      memberCount: hasFamily && family ? session.getMembers(family.id).length : 0,
      currentFamilyId: hasFamily && family ? family.id : "", primaryFamilyId: session.getPrimaryFamilyId(),
      primaryText: hasFamily ? "打开我的家庭" : "创建我的家庭"
    });
  },
  async restoreFamilySession(force = false, allowSignIn = false) {
    if (this.data.restoring) return;
    const cached = session.getFamily();
    const user = session.getUser();
    // Ordinary visitors and search crawlers see the same public welcome page.
    // A new visitor only signs in after choosing a family action explicitly.
    if (!user && !session.getToken() && !allowSignIn) {
      session.clearFamily();
      this.setData({ ...emptyContent(), hasFamily: false, families: [], currentFamilyId: "", familyName: "", memberCount: 0, loading: false, restoring: false, error: "", familyListError: "" });
      return;
    }
    if (!force && !this.preferPrimary && user && user.id === this.loadedUserId && session.hasValidToken()
      && this.data.hasFamily && cached && cached.id === this.data.currentFamilyId
      && this.data.lastRestoredAt && Date.now() - this.data.lastRestoredAt < refreshIntervalMs
      && this.loadedRevision === session.getHomeRevision() && !this.data.error && !this.data.familyListError) return;
    const epoch = this.restoreEpoch, contentEpoch = ++this.contentEpoch, revision = session.getHomeRevision();
    this.setData({ restoring: true, familyListError: "", error: "" });
    try {
      const current = session.getFamily(), primaryId = session.getPrimaryFamilyId();
      const preferredId = this.preferPrimary ? primaryId || (current && current.id) : (current && current.id) || primaryId;
      // One request signs in when needed and returns the selected family view.
      const requestAt = Date.now();
      const response = await api.bootstrapHome({ familyId: preferredId || undefined, fallbackFamilyId: current ? current.id : undefined });
      this.requestMs = Date.now() - requestAt;
      if (epoch !== this.restoreEpoch || contentEpoch !== this.contentEpoch) return;
      const boot = response.data.home;
      const membership = boot.families.find(item => item.family.id === boot.currentFamilyId);
      this.preferPrimary = false;
      if (!membership || !boot.dashboard) {
        session.clearFamily();
        this.setData({ ...emptyContent(), hasFamily: false, families: [], currentFamilyId: "", familyName: "", restoring: false, loading: false, lastRestoredAt: Date.now() });
        return;
      }
      if (!boot.families.some(item => item.family.id === primaryId)) session.setPrimaryFamilyId(membership.family.id);
      this.activateFamily(membership);
      this.renderDashboard(boot.dashboard);
      if (boot.activity) this.applyHeroDetails(boot.activity);
      this.loadedRevision = revision;
      const loadedUser = session.getUser();
      this.loadedUserId = loadedUser ? loadedUser.id : "";
      this.setData({
        families: boot.families.map(item => ({ ...item, id: item.family.id, initial: item.family.name.slice(0, 1) })),
        joinRequestCount: boot.joinRequestCount ?? 0, restoring: false, loading: false,
        lastRestoredAt: Date.now(), switcherVisible: this.openSwitcherOnRestore
      }, () => {
        if (!this.showPerf || this.perfReported) return;
        this.perfReported = true;
        const totalMs = Date.now() - this.startupAt;
        this.setData({ perfText: `首屏 ${(totalMs / 1000).toFixed(1)}s · 请求 ${Math.round(this.requestMs)}ms` });
      });
      this.openSwitcherOnRestore = false;
    } catch (error) {
      if (epoch !== this.restoreEpoch || contentEpoch !== this.contentEpoch) return;
      if (error instanceof ApiRequestError && [401, 403, 404].includes(error.statusCode)) {
        session.clearFamily();
        this.setData({ ...emptyContent(), hasFamily: false, families: [], currentFamilyId: "", familyName: "", lastRestoredAt: 0 });
      }
      // Never follow one failed startup request with another slow legacy request.
      this.setData({ restoring: false, loading: false, familyListError: "暂时没能加载家里的安排，请检查网络后重试。" });
    }
  },

  activateFamily(membership: FamilyMembership) {
    const changed = this.data.currentFamilyId !== membership.family.id;
    session.setFamily(membership.family); session.setMember(membership.member); session.setMembers(membership.family.id, membership.members);
    this.setData({
      ...(changed ? { ...emptyContent(), error: "", loading: true } : {}), hasFamily: true,
      currentFamilyId: membership.family.id, familyName: membership.family.name,
      memberCount: membership.members.length, primaryFamilyId: session.getPrimaryFamilyId(), primaryText: "打开我的家庭"
    });
  },
  async loadDashboard() {
    const family = session.getFamily();
    if (!family || !this.data.hasFamily) return;
    const epoch = this.restoreEpoch;
    const contentEpoch = ++this.contentEpoch, revision = session.getHomeRevision();
    this.setData({ loading: true, error: "" });
    const member = session.getMember();
    if (member && member.role === "admin") void this.loadJoinRequestCount(family.id, epoch, contentEpoch);
    try {
      const d: FamilyDashboard = (await api.getDashboard(family.id)).data;
      if (epoch !== this.restoreEpoch || contentEpoch !== this.contentEpoch || !session.isFamily(family.id)) return;
      this.renderDashboard(d);
      this.loadedRevision = revision;
      const loadedUser = session.getUser();
      this.loadedUserId = loadedUser ? loadedUser.id : "";
      const next = d.upcoming[0] ?? d.activities[0];
      if (next) void this.loadHeroDetails(family.id, next.id, epoch, contentEpoch);
    } catch (error) {
      if (epoch !== this.restoreEpoch || contentEpoch !== this.contentEpoch || !session.isFamily(family.id)) return;
      if (error instanceof ApiRequestError && [401, 403, 404].includes(error.statusCode)) {
        session.clearFamily(); this.setData({ ...emptyContent(), hasFamily: false, families: [], currentFamilyId: "", familyName: "", loading: false, lastRestoredAt: 0, familyListError: "已无法访问这个家庭，请刷新后重新选择。" });
      } else {
        this.setData({ ...emptyContent(), loading: false, error: "暂时没能加载家里的安排，请重试。" });
      }
    }
  },
  renderDashboard(d: FamilyDashboard) {
    const item = (r: DashboardItem, label: string, page: string, kind: string): HomeItem => ({ ...r, key: `${kind}:${r.id}`, label, page, kind, timeText: dateText(r.at) });
    const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime();
    const weekEnd=new Date(now.getFullYear(),now.getMonth(),now.getDate()+7).getTime();
    const currentReminders=d.reminders.filter(r=>Date.parse(r.at)<end);
    const pending=[...currentReminders.map(r=>item(r,Date.parse(r.at)<start?"较早提醒 · 待确认":"今天的提醒","reminders","reminder")),
      ...d.activities.map(r=>item(r,"待我回应","activities","activity")),...d.tasks.map(r=>item(r,"我负责","activities","task"))];
    const bucket=(r:HomeItem)=>{const at=Date.parse(r.at);return at>=start&&at<end?0:at<start?1:2;};
    const kindOrder:Record<string,number>={reminder:0,task:1,activity:2};
    pending.sort((a,b)=>bucket(a)-bucket(b)||Date.parse(a.at)-Date.parse(b.at)||(kindOrder[a.kind]??3)-(kindOrder[b.kind]??3)||a.key.localeCompare(b.key));
    const pendingActivityIds=new Set(d.activities.map(r=>r.id));
    const upcoming=[...d.reminders.filter(r=>Date.parse(r.at)>=end).map(r=>item(r,"提醒","reminders","reminder")),
      ...d.upcoming.filter(r=>!pendingActivityIds.has(r.id)).map(r=>item(r,"家庭活动","activities","activity"))]
      .filter(r=>Date.parse(r.at)>=now.getTime()&&Date.parse(r.at)<weekEnd).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const next = d.upcoming[0] ?? d.activities[0];
    this.setData({
      hero:next?{...next,timeText:dateText(next.at),location:"",responseText:"",needsResponse:d.activities.some(r=>r.id===next.id),actionText:d.activities.some(r=>r.id===next.id)?"回应邀请":"查看安排"}:null,
      todos:pending.slice(0,3),moreTodoCount:Math.max(0,pending.length-3),
      reminders:d.reminders.slice(0,3).map(r=>item(r,"与我有关","reminders","reminder")),upcomingItems:upcoming.slice(0,4),
      pendingCount:pending.length,pendingReminderCount:currentReminders.length,pendingActivityCount:d.activities.length+d.tasks.length,loading:false
    });
  },
  applyHeroDetails(a: Activity) {
    if (!this.data.hero || this.data.hero.id !== a.id) return;
    const member = session.getMember(), mine = a.participants?.find(p => member && p.memberId === member.id);
    const needsResponse = Boolean(mine && ["pending", "tentative"].includes(mine.rsvp));
    const count = (a.participants ?? []).filter(p => p.rsvp === "accepted").length;
    if (a.status === "cancelled" || a.status === "completed") { this.setData({ hero: null }); return; }
    this.setData({ hero: { ...this.data.hero, title: a.title, timeText: dateText(a.startsAt), location: a.location || "", responseText: count ? `${count} 位家人已确认` : "等待家人一起回应", needsResponse, actionText: needsResponse ? "回应邀请" : "查看安排" } });
  },
  async loadJoinRequestCount(familyId: string, epoch: number, contentEpoch: number) {
    try {
      const response = await api.listJoinRequests(familyId);
      if (epoch !== this.restoreEpoch || contentEpoch !== this.contentEpoch || !session.isFamily(familyId) || !this.data.hasFamily) return;
      this.setData({ joinRequestCount: response.data.length });
    } catch { /* Management keeps its own explicit retry and application list. */ }
  },
  async loadHeroDetails(familyId: string, id: string, epoch: number, contentEpoch: number) {
    try {
      const a = (await api.getActivity(familyId, id)).data;
      if (epoch !== this.restoreEpoch || contentEpoch !== this.contentEpoch || !session.isFamily(familyId) || this.data.hero?.id !== id) return;
      this.applyHeroDetails(a);
    } catch { /* The independently loaded dashboard remains useful without details. */ }
  },
  onOpenSwitcher() { this.setData({ switcherVisible: true }); },
  onCloseSwitcher() { this.setData({ switcherVisible: false }); },
  onStopPropagation() {},
  async onSelectFamily(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.busyTaskId) return;
    const membership = this.data.families.find(item => item.family.id === event.currentTarget.dataset.id);
    if (!membership) return;
    this.restoreEpoch++;
    this.activateFamily(membership);
    this.setData({ switcherVisible: false, restoring: false });
    await this.loadDashboard();
  },
  onSetPrimary(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    if (!this.data.families.some(item => item.family.id === id)) return;
    session.setPrimaryFamilyId(id); this.setData({ primaryFamilyId: id });
    wx.showToast({ title: "已设为主家庭", icon: "success" });
  },
  async onHeroAction() {
    const hero=this.data.hero;if(!hero)return;
    if(!hero.needsResponse){this.openActivity(hero.id);return;}
    await this.respondToActivity(hero.id);
  },
  async onRespondActivity(event:WechatMiniprogram.TouchEvent){await this.respondToActivity(String(event.currentTarget.dataset.id));},
  async respondToActivity(activityId:string) {
    const family=session.getFamily(),member=session.getMember();if(!family||!member||this.data.busy)return;
    const epoch = this.restoreEpoch;
    this.setData({ busy: true });
    try {
      const choice = await wx.showActionSheet({ itemList: ["确认参加", "暂时待定", "无法参加"] });
      if (epoch !== this.restoreEpoch || !session.isFamily(family.id)) return;
      const rsvp: RsvpStatus = (["accepted", "tentative", "declined"] as const)[choice.tapIndex];
      await api.updateActivityRsvp(family.id, activityId, { actorMemberId: member.id, memberId: member.id, rsvp });
      if (epoch !== this.restoreEpoch || !session.isFamily(family.id)) return;
      wx.showToast({ title: "已告诉家人", icon: "success" });
      await this.loadDashboard();
    } catch (error) {
      if (!(typeof error === "object" && error && "errMsg" in error && String(error.errMsg).includes("cancel"))) wx.showToast({ title: errorMessage(error), icon: "none" });
    } finally { this.setData({ busy: false }); }
  },
  async onCompleteTask(event: WechatMiniprogram.TouchEvent) {
    const family = session.getFamily(), member = session.getMember();
    const todo = this.data.todos.find(r => r.key === event.currentTarget.dataset.key);
    if (!family || !member || !todo?.activityId || this.data.busyTaskId) return;
    const epoch = this.restoreEpoch;
    this.setData({ busyTaskId: todo.id });
    try {
      const activity: Activity = (await api.getActivity(family.id, todo.activityId)).data;
      if (epoch !== this.restoreEpoch || !session.isFamily(family.id)) return;
      const task = activity.tasks?.find(t => t.id === todo.id);
      if (!task) throw new Error("事项已更新，请刷新后再试");
      if (task.status !== "done") await api.updateActivityTask(family.id, todo.activityId, todo.id, { actorMemberId: member.id, status: "done", version: task.version });
      if (epoch !== this.restoreEpoch || !session.isFamily(family.id)) return;
      wx.showToast({ title: "准备好了", icon: "success" }); await this.loadDashboard();
    } catch (error) { wx.showToast({ title: errorMessage(error), icon: "none" }); }
    finally { this.setData({ busyTaskId: "" }); }
  },
  openActivity(id: string) {
    const family = session.getFamily();
    if (family) wx.navigateTo({ url: `/pages/activities/index?familyId=${encodeURIComponent(family.id)}&activityId=${encodeURIComponent(id)}` });
  },
  onOpenTodo(event: WechatMiniprogram.TouchEvent) {
    if (event.currentTarget.dataset.page === "reminders") { const id=event.currentTarget.dataset.id; if(id)wx.navigateTo({url:`/pages/reminders/index?focus=${encodeURIComponent(String(id))}`});else this.onOpenReminders();return; }
    this.openActivity(String(event.currentTarget.dataset.activityId || event.currentTarget.dataset.id));
  },
  onOpenActivities() { openFamilyPage("activities"); },
  onCreateActivity() { wx.navigateTo({ url: "/pages/activities/index?create=1" }); },
  onOpenReminders() { openFamilyPage("reminders"); },
  onOpenBirthdayReminders(){wx.navigateTo({url:"/pages/reminders/index?filter=birthday"});},
  onOpenHealthReminders(){wx.navigateTo({url:"/pages/reminders/index?filter=health"});},
  onOpenLedger() { wx.navigateTo({ url: "/pages/ledger/index" }); },
  onOpenFamily() { openFamilyPage("family"); },
  onRetry() { this.skipInitialRestore = false; void this.restoreFamilySession(true); },
  onRestoreExistingFamily() { this.skipInitialRestore = false; return this.restoreFamilySession(true, true); },
  onCreateFamily() { this.setData({ switcherVisible: false }); wx.navigateTo({ url: "/pages/create-family/index" }); },
  onPrimaryAction() { this.skipInitialRestore = false; if (this.data.hasFamily) this.onOpenFamily(); else this.onCreateFamily(); },
  onJoinFamily() { this.setData({ switcherVisible: false }); wx.navigateTo({ url: "/pages/join/index" }); },
  onShareAppMessage() { return publicProductShare(); },
  onOpenHelp() { wx.navigateTo({ url: "/pages/help/index" }); }
});
