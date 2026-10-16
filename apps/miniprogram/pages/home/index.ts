import { api, ApiRequestError, errorMessage, type Activity, type DashboardItem, type FamilyMembership, type FamilyDashboard, type RsvpStatus } from "../../utils/api";
import { session } from "../../utils/session";
import { getWechatIdentity } from "../../utils/wechat";
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
const emptyContent = () => ({ hero: null as Hero | null, todos: [] as HomeItem[], reminders: [] as HomeItem[], pendingCount: 0, moreTodoCount: 0, joinRequestCount: 0 });

Page({
  data: {
    ...emptyContent(), hasFamily: false, primaryText: "创建我的家庭", familyName: "", memberCount: 0,
    families: [] as HomeFamily[], currentFamilyId: "", primaryFamilyId: "", restoring: false,
    lastRestoredAt: 0, loading: false, error: "", familyListError: "", switcherVisible: false,
    busy: false, busyTaskId: "", dateLabel: ""
  },
  restoreEpoch: 0,
  contentEpoch: 0,
  skipInitialRestore: false,
  preferPrimary: true,
  openSwitcherOnRestore: false,
  onLoad(query: Record<string, string | undefined>) {
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
  async restoreFamilySession(force = false) {
    if (this.data.restoring) return;
    if (!force && !this.preferPrimary && this.data.lastRestoredAt && Date.now() - this.data.lastRestoredAt < refreshIntervalMs) {
      await this.loadDashboard(); return;
    }
    const epoch = this.restoreEpoch;
    this.setData({ restoring: true, familyListError: "" });
    try {
      await getWechatIdentity();
      if (epoch !== this.restoreEpoch) return;
      const response = await api.listMyFamilies();
      if (epoch !== this.restoreEpoch) return;
      const primaryId = session.getPrimaryFamilyId(), currentFamily = session.getFamily();
      const primary = response.data.find(item => item.family.id === primaryId);
      const current = response.data.find(item => currentFamily && item.family.id === currentFamily.id);
      const membership = (this.preferPrimary ? primary : current) ?? current ?? primary ?? response.data[0];
      this.preferPrimary = false;
      if (!membership) {
        session.clearFamily();
        this.setData({ ...emptyContent(), hasFamily: false, families: [], currentFamilyId: "", familyName: "", restoring: false, loading: false, lastRestoredAt: Date.now() });
        return;
      }
      if (!primary) session.setPrimaryFamilyId(membership.family.id);
      this.activateFamily(membership);
      this.setData({
        families: response.data.map(item => ({ ...item, id: item.family.id, initial: item.family.name.slice(0, 1) })), restoring: false,
        lastRestoredAt: Date.now(), switcherVisible: this.openSwitcherOnRestore
      });
      this.openSwitcherOnRestore = false;
      await this.loadDashboard();
    } catch {
      if (epoch !== this.restoreEpoch) return;
      this.syncHomeState();
      this.setData({ restoring: false, familyListError: "家庭列表暂时无法更新，请检查网络后重试。" });
      if (this.data.hasFamily) await this.loadDashboard();
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
    const contentEpoch = ++this.contentEpoch;
    this.setData({ loading: true, error: "" });
    const member = session.getMember();
    if (member && member.role === "admin") void this.loadJoinRequestCount(family.id, epoch, contentEpoch);
    try {
      const d: FamilyDashboard = (await api.getDashboard(family.id)).data;
      if (epoch !== this.restoreEpoch || contentEpoch !== this.contentEpoch || !session.isFamily(family.id)) return;
      const item = (r: DashboardItem, label: string, page: string, kind: string): HomeItem => ({ ...r, key: `${kind}:${r.id}`, label, page, kind, timeText: dateText(r.at) });
      const next = d.upcoming[0] ?? d.activities[0];
      const todos = [
        ...d.activities.filter(r => r.id !== next?.id).map(r => item(r, "待我回应", "activities", "activity")),
        ...d.tasks.map(r => item(r, "我负责", "activities", "task"))
      ];
      this.setData({
        hero: next ? { ...next, timeText: dateText(next.at), location: "", responseText: "", needsResponse: d.activities.some(r => r.id === next.id), actionText: d.activities.some(r => r.id === next.id) ? "回应邀请" : "查看安排" } : null,
        todos: todos.slice(0, 3), moreTodoCount: Math.max(0, todos.length - 3),
        reminders: d.reminders.slice(0, 3).map(r => item(r, "与我有关", "reminders", "reminder")),
        pendingCount: d.activities.length + d.tasks.length + d.reminders.length, loading: false
      });
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
      const member = session.getMember(), mine = a.participants?.find(p => member && p.memberId === member.id);
      const needsResponse = Boolean(mine && ["pending", "tentative"].includes(mine.rsvp));
      const count = (a.participants ?? []).filter(p => p.rsvp === "accepted").length;
      if (a.status === "cancelled" || a.status === "completed") { this.setData({ hero: null }); return; }
      this.setData({ hero: { ...this.data.hero, title: a.title, timeText: dateText(a.startsAt), location: a.location || "", responseText: count ? `${count} 位家人已确认` : "等待家人一起回应", needsResponse, actionText: needsResponse ? "回应邀请" : "查看安排" } });
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
    const family = session.getFamily(), member = session.getMember(), hero = this.data.hero;
    if (!family || !member || !hero || this.data.busy) return;
    if (!hero.needsResponse) { this.openActivity(hero.id); return; }
    const epoch = this.restoreEpoch;
    this.setData({ busy: true });
    try {
      const choice = await wx.showActionSheet({ itemList: ["确认参加", "暂时待定", "无法参加"] });
      if (epoch !== this.restoreEpoch || !session.isFamily(family.id)) return;
      const rsvp: RsvpStatus = (["accepted", "tentative", "declined"] as const)[choice.tapIndex];
      await api.updateActivityRsvp(family.id, hero.id, { actorMemberId: member.id, memberId: member.id, rsvp });
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
    if (event.currentTarget.dataset.page === "reminders") { this.onOpenReminders(); return; }
    this.openActivity(String(event.currentTarget.dataset.activityId || event.currentTarget.dataset.id));
  },
  onOpenActivities() { openFamilyPage("activities"); },
  onCreateActivity() { wx.navigateTo({ url: "/pages/activities/index?create=1" }); },
  onOpenReminders() { wx.navigateTo({ url: "/pages/reminders/index" }); },
  onOpenLedger() { wx.navigateTo({ url: "/pages/ledger/index" }); },
  onOpenFamily() { openFamilyPage("family"); },
  onRetry() { this.skipInitialRestore = false; void this.restoreFamilySession(true); },
  onCreateFamily() { this.setData({ switcherVisible: false }); wx.navigateTo({ url: "/pages/create-family/index" }); },
  onPrimaryAction() { this.skipInitialRestore = false; if (this.data.hasFamily) this.onOpenFamily(); else this.onCreateFamily(); },
  onJoinFamily() { this.setData({ switcherVisible: false }); wx.navigateTo({ url: "/pages/join/index" }); },
  onOpenHelp() { wx.navigateTo({ url: "/pages/help/index" }); }
});
