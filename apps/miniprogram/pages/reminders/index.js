"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const session_1 = require("../../utils/session");
const discovery_1 = require("../../utils/discovery");
const wechat_1 = require("../../utils/wechat");
const birthday_1 = require("../../utils/birthday");
const reminderTypes = [
    { label: "生日", value: "birthday" },
    { label: "吃药", value: "medicine" },
    { label: "运动", value: "exercise" }
];
const frequencyOptions = [
    { label: "仅一次", value: "once", timesOfDay: [] },
    { label: "每天一次", value: "daily_once", timesOfDay: ["08:00"] },
    { label: "每天两次", value: "daily_twice", timesOfDay: ["08:00", "20:00"] },
    { label: "每天三次", value: "daily_three_times", timesOfDay: ["08:00", "13:00", "20:00"] },
    { label: "每周一次", value: "weekly", timesOfDay: ["08:00"] },
    { label: "每月一次", value: "monthly", timesOfDay: [] },
    { label: "每年一次", value: "yearly", timesOfDay: [] }
];
const targetScopeOptions = [
    { label: "全家一起", value: "family" },
    { label: "指定成员", value: "member" }
];
const pageRefreshIntervalMs = 30 * 1000;
const advanceDayOptions = [0, 1, 3, 7, 14, 30].map((value) => ({
    label: value === 0 ? "不提前" : `提前 ${value} 天`,
    value
}));
const pad = (value) => value.toString().padStart(2, "0");
const formatInputTime = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
const formatDateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const defaultDueAtInput = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(8, 0, 0, 0);
    return formatInputTime(date);
};
const normalizeDueAt = (value) => {
    const parsed = new Date(value.replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};
const memberBirthdayFields = (member) => ({
    birthdayDateInput: member?.birthday ?? "",
    birthdayCalendar: member?.birthdayCalendar ?? "solar",
    birthdayLeapMonth: Boolean(member?.birthdayCalendar === "lunar" && member.birthdayLeapMonth),
    birthdayInputDirty: false
});
const memberName = (member) => {
    const displayName = member?.displayName.trim();
    if (displayName && displayName !== "我") {
        return displayName;
    }
    return member?.role === "admin" ? "家庭管理员" : "家人";
};
const typeLabel = (type) => reminderTypes.find((item) => item.value === type)?.label ?? "提醒";
const notificationLabel = (reminder) => {
    if (!reminder.notification) {
        return ' · 尚无可发送的微信通知';
    }
    if (reminder.notification.sendStatus === "sent") {
        return " · 已提交微信，尚不知是否阅读";
    }
    if (reminder.notification.sendStatus === "pending") {
        return " · 微信通知待发送";
    }
    const labels = { processing: '正在发送', failed: '发送失败，请打开查看', skipped: '本次未授权，不会发送', expired: '通知已过期', unknown: '发送结果未确认，请打开查看', canceled: '本次通知已取消' };
    return ` · ${labels[reminder.notification.sendStatus] ?? '请查看通知授权'}`;
};
const reminderMeta = (reminder) => {
    const scheduleParts = [
        reminder.schedule?.targetLabel,
        reminder.schedule?.frequencyLabel,
        reminder.schedule?.birthdayDate ? (0, birthday_1.birthdayLabel)(reminder.schedule.birthdayDate, reminder.schedule.birthdayCalendar ?? "solar", reminder.schedule.birthdayLeapMonth) : undefined
    ].filter(Boolean);
    return scheduleParts.length > 0 ? ` · ${scheduleParts.join(" · ")}` : "";
};
const withReminderText = (reminder, hasNextOccurrence) => ({
    ...reminder,
    typeLabel: typeLabel(reminder.type),
    stateLabel: !reminder.enabled ? "已停止" : reminder.completedAt ? "已完成" : Date.parse(reminder.dueAt) < Date.now() ? "已到期" : "待提醒",
    notificationText: notificationLabel(reminder).replace(/^ · /, ""),
    dueAtText: formatInputTime(new Date(reminder.dueAt)),
    birthdayText: reminder.type === "birthday" ? (0, birthday_1.birthdayLabel)(reminder.schedule?.birthdayDate ?? "", reminder.schedule?.birthdayCalendar ?? "solar", reminder.schedule?.birthdayLeapMonth) : "",
    statusLabel: `${!reminder.enabled ? '已取消' : reminder.completedAt ? "已完成" : Date.parse(reminder.dueAt) < Date.now() ? '已到期，待确认' : "待提醒"}${hasNextOccurrence ? " · 下次已安排" : ""}${notificationLabel(reminder)}${reminderMeta(reminder)}`,
    isCompleted: Boolean(reminder.completedAt),
    canComplete: Boolean(reminder.enabled && reminder.participants?.some(participant => participant.memberId === (session_1.session.getMember() || { id: "" }).id)),
    canManage: Boolean(session_1.session.getMember() && (session_1.session.getMember() || { role: '' }).role === 'admin' || reminder.createdByMemberId === (session_1.session.getMember() || { id: '' }).id),
    canSubscribe: Boolean(reminder.enabled && Date.parse(reminder.dueAt) > Date.now() && ['pending', 'skipped'].includes(reminder.notification?.sendStatus ?? '') && reminder.participants?.some(p => p.memberId === (session_1.session.getMember() || { id: '' }).id)),
    completionText: `已完成 ${reminder.participants?.filter(p => p.status === "completed").length ?? 0}/${reminder.participants?.length ?? 0} 人`
});
const statusCodeFromError = (error) => {
    if (typeof error === "object" && error && "statusCode" in error) {
        const statusCode = error.statusCode;
        if (typeof statusCode === "number") {
            return statusCode;
        }
    }
    if (error instanceof Error) {
        const match = error.message.match(/status (\d+)/);
        return match ? Number(match[1]) : undefined;
    }
    return undefined;
};
const isAuthReminderError = (error) => {
    const statusCode = statusCodeFromError(error);
    return statusCode === 401 || statusCode === 403;
};
Page({
    data: {
        todayDate: formatDateInput(new Date()), busy: false, familyName: "", error: "", dateInput: defaultDueAtInput().slice(0, 10), timeInput: "08:00",
        editingPlan: null,
        editTitleInput: '', editDateInput: '', editTimeInput: '08:00', editBirthdayInput: '', editBirthdayCalendar: 'solar', editBirthdayLeapMonth: false, editFrequencyIndex: 0,
        focusedReminderId: "", filter: "all", visibleReminders: [], formVisible: false,
        reminderTypes,
        frequencyOptions,
        targetScopeOptions,
        advanceDayOptions,
        typeIndex: 1,
        memberIndex: 0,
        frequencyIndex: 1,
        targetScopeIndex: 0,
        advanceDayIndex: 3,
        titleInput: "提醒吃药",
        dueAtInput: defaultDueAtInput(),
        ...memberBirthdayFields(),
        notifyOnBirthday: true,
        members: [],
        memberOptions: [],
        reminders: [],
        loading: false,
        refreshing: false,
        lastLoadedAt: 0
    },
    currentFamilyId: "", loadEpoch: 0, loadedRevision: -1,
    focusRequested: false,
    onLoad(query) { this.focusRequested = Boolean(query.focus); this.setData({ focusedReminderId: query.focus ?? "" }); this.setFilter(query.filter ?? "all"); },
    setFilter(filter) {
        if (!["all", "birthday", "health"].includes(filter))
            filter = "all";
        this.setData({ filter });
        if (filter === "birthday")
            this.onTypeChange({ detail: { value: "0" } });
        else if (filter === "health" && this.data.typeIndex === 0)
            this.onTypeChange({ detail: { value: "1" } });
        this.applyReminderFilter();
    },
    onFilterChange(e) { this.focusRequested = false; this.setData({ focusedReminderId: "" }); this.setFilter(String(e.currentTarget.dataset.filter)); },
    applyReminderFilter() {
        const visibleReminders = this.data.reminders.filter(r => this.data.filter === "all" || this.data.filter === "birthday" && r.type === "birthday" || this.data.filter === "health" && ["medicine", "exercise"].includes(r.type));
        this.setData({ visibleReminders }, () => { if (this.focusRequested && visibleReminders.some(r => r.id === this.data.focusedReminderId)) {
            this.focusRequested = false;
            wx.pageScrollTo({ selector: `#reminder-${this.data.focusedReminderId}`, duration: 200 });
        } });
    },
    onShow() {
        const family = session_1.session.getFamily();
        if (!family) {
            wx.redirectTo({ url: '/pages/home/index' });
            return;
        }
        if (this.currentFamilyId !== family.id) {
            this.loadEpoch++;
            this.setData({ members: [], memberOptions: [], reminders: [], visibleReminders: [], lastLoadedAt: 0, refreshing: false, formVisible: false, editingPlan: null, memberIndex: 0, ...memberBirthdayFields() });
            this.currentFamilyId = family.id;
        }
        this.setData({ familyName: family.name });
        void this.loadPage();
    },
    onHide() { this.loadEpoch++; this.setData({ refreshing: false, loading: false }); },
    onDueDateChange(e) { const date = String(e.detail.value); this.setData({ dateInput: date, dueAtInput: `${date} ${this.data.timeInput}` }); },
    onDueTimeChange(e) { const time = String(e.detail.value); this.setData({ timeInput: time, dueAtInput: `${this.data.dateInput} ${time}` }); },
    onBirthdayDateChange(e) { this.setData({ birthdayDateInput: String(e.detail.value) }); },
    onBirthdayChange(e) { this.setData({ birthdayDateInput: e.detail.value, birthdayCalendar: e.detail.calendar, birthdayLeapMonth: e.detail.calendar === 'lunar' && e.detail.leapMonth, birthdayInputDirty: true }); },
    onRetry() { void this.loadPage({ force: true, showLoading: true }); },
    onToggleForm() { if (this.data.busy)
        return; this.setData({ formVisible: !this.data.formVisible, editingPlan: null }); wx.pageScrollTo({ scrollTop: 0, duration: 200 }); },
    onEditTitleInput(e) { this.setData({ editTitleInput: e.detail.value }); },
    onEditDateChange(e) { this.setData({ editDateInput: String(e.detail.value) }); },
    onEditTimeChange(e) { this.setData({ editTimeInput: String(e.detail.value) }); },
    onEditBirthdayDateChange(e) { this.setData({ editBirthdayInput: String(e.detail.value) }); },
    onEditBirthdayChange(e) { this.setData({ editBirthdayInput: e.detail.value, editBirthdayCalendar: e.detail.calendar, editBirthdayLeapMonth: e.detail.calendar === 'lunar' && e.detail.leapMonth }); },
    onEditBirthdayInput(e) { this.setData({ editBirthdayInput: e.detail.value }); },
    onEditFrequencyChange(e) { this.setData({ editFrequencyIndex: Number(e.detail.value) }); },
    onCancelPlanEdit() { this.setData({ editingPlan: null }); },
    async onEditPlan(e) {
        const family = session_1.session.getFamily();
        if (!family || this.data.busy)
            return;
        this.setData({ busy: true });
        try {
            const p = (await api_1.api.getReminderPlan(family.id, String(e.currentTarget.dataset.planId))).data;
            const date = formatInputTime(new Date(p.dueAt));
            this.setData({ formVisible: false, editingPlan: p, editTitleInput: p.title, editDateInput: date.slice(0, 10), editTimeInput: date.slice(11), editBirthdayInput: p.schedule.birthdayDate ?? '', editBirthdayCalendar: p.schedule.birthdayCalendar ?? 'solar', editBirthdayLeapMonth: Boolean(p.schedule.birthdayCalendar === 'lunar' && p.schedule.birthdayLeapMonth), editFrequencyIndex: Math.max(0, frequencyOptions.findIndex(f => f.value === p.frequency)) });
            wx.pageScrollTo({ scrollTop: 0, duration: 200 });
        }
        catch (error) {
            wx.showToast({ title: (0, api_1.errorMessage)(error), icon: 'none' });
        }
        finally {
            this.setData({ busy: false });
        }
    },
    async onSavePlan() {
        const family = session_1.session.getFamily(), p = this.data.editingPlan;
        if (!family || !p || this.data.busy)
            return;
        const dueAt = normalizeDueAt(`${this.data.editDateInput} ${this.data.editTimeInput}`), title = this.data.editTitleInput.trim();
        if (!dueAt || !title) {
            wx.showToast({ title: '请补全名称和时间', icon: 'none' });
            return;
        }
        if (p.type === 'birthday' && !(0, birthday_1.validBirthday)(this.data.editBirthdayInput, this.data.editBirthdayCalendar)) {
            wx.showToast({ title: '请重新选择生日日期', icon: 'none' });
            return;
        }
        const frequency = frequencyOptions[this.data.editFrequencyIndex] ?? frequencyOptions[0];
        const schedule = { ...p.schedule, ...(p.type === 'birthday' ? { birthdayDate: this.data.editBirthdayInput, birthdayCalendar: this.data.editBirthdayCalendar, birthdayLeapMonth: this.data.editBirthdayCalendar === 'lunar' && this.data.editBirthdayLeapMonth, frequencyLabel: this.data.editBirthdayCalendar === 'lunar' && this.data.editBirthdayLeapMonth ? '对应闰月' : '每年' } : { frequencyLabel: frequency.label, timesOfDay: frequency.value === 'daily_once' ? [this.data.editTimeInput] : frequency.timesOfDay }) };
        this.setData({ busy: true });
        try {
            await api_1.api.updateReminderPlan(family.id, p.id, { ...p, title, dueAt, frequency: p.type === 'birthday' ? 'yearly' : frequency.value, schedule });
            this.setData({ editingPlan: null });
            await this.loadPage({ force: true, showLoading: false });
            wx.showToast({ title: '已修改，请重新授权本次通知', icon: 'none' });
        }
        catch (error) {
            wx.showToast({ title: (0, api_1.errorMessage)(error), icon: 'none' });
        }
        finally {
            this.setData({ busy: false });
        }
    },
    async onPausePlan(e) {
        const family = session_1.session.getFamily();
        if (!family || this.data.busy)
            return;
        const confirmed = await wx.showModal({ title: '停止这个提醒计划？', content: '停止后不再产生新的提醒，未发送的通知会取消，已完成的记录保留。' });
        if (!confirmed.confirm)
            return;
        this.setData({ busy: true });
        try {
            const p = (await api_1.api.getReminderPlan(family.id, String(e.currentTarget.dataset.planId))).data;
            await api_1.api.pauseReminderPlan(family.id, p.id, p.version);
            await this.loadPage({ force: true, showLoading: false });
            wx.showToast({ title: '提醒计划已停止', icon: 'none' });
        }
        catch (error) {
            wx.showToast({ title: (0, api_1.errorMessage)(error), icon: 'none' });
        }
        finally {
            this.setData({ busy: false });
        }
    },
    onTypeChange(event) {
        const typeIndex = Number(event.detail.value);
        const reminderType = reminderTypes[typeIndex]?.value;
        const nextTitle = reminderType === "birthday" ? "家人生日" : reminderType === "exercise" ? "提醒运动" : "提醒吃药";
        this.setData({
            typeIndex,
            titleInput: nextTitle,
            frequencyIndex: reminderType === "medicine" ? 1 : 0
        });
    },
    onMemberChange(event) {
        const memberIndex = Number(event.detail.value);
        const member = this.data.members[memberIndex];
        this.setData({
            memberIndex,
            ...memberBirthdayFields(member)
        });
    },
    onFrequencyChange(event) {
        this.setData({
            frequencyIndex: Number(event.detail.value)
        });
    },
    onTargetScopeChange(event) {
        this.setData({
            targetScopeIndex: Number(event.detail.value)
        });
    },
    onAdvanceDayChange(event) {
        this.setData({
            advanceDayIndex: Number(event.detail.value)
        });
    },
    onTitleInput(event) {
        this.setData({
            titleInput: event.detail.value
        });
    },
    onDueAtInput(event) {
        this.setData({
            dueAtInput: event.detail.value
        });
    },
    onBirthdayDateInput(event) {
        this.setData({
            birthdayDateInput: event.detail.value
        });
    },
    onNotifyOnBirthdayChange(event) {
        this.setData({
            notifyOnBirthday: event.detail.value
        });
    },
    async loadPage(options = {}) {
        if (!options.force && this.loadedRevision === session_1.session.getHomeRevision() &&
            this.data.lastLoadedAt > 0 &&
            Date.now() - this.data.lastLoadedAt < pageRefreshIntervalMs) {
            return;
        }
        if (this.data.refreshing && !options.force) {
            return;
        }
        const epoch = ++this.loadEpoch, revision = session_1.session.getHomeRevision();
        this.setData({ refreshing: true, error: "" });
        await Promise.all([
            this.loadMembers(),
            this.loadReminders({ showLoading: options.showLoading ?? this.data.reminders.length === 0 })
        ]);
        if (epoch !== this.loadEpoch)
            return;
        this.loadedRevision = revision;
        this.setData({
            refreshing: false,
            lastLoadedAt: Date.now()
        });
    },
    async loadMembers() {
        const family = session_1.session.getFamily(), epoch = this.loadEpoch;
        if (!family) {
            return;
        }
        const cachedMembers = session_1.session.getMembers(family.id);
        if (cachedMembers.length > 0) {
            this.setData({
                members: cachedMembers,
                memberOptions: cachedMembers.map(memberName),
                ...(this.data.birthdayInputDirty ? {} : memberBirthdayFields(cachedMembers[this.data.memberIndex]))
            });
        }
        try {
            const response = await api_1.api.listMembers(family.id);
            if (epoch !== this.loadEpoch || !session_1.session.isFamily(family.id))
                return;
            const members = response.data;
            session_1.session.setMembers(family.id, members);
            this.setData({
                members,
                memberOptions: members.map(memberName),
                ...(this.data.birthdayInputDirty ? {} : memberBirthdayFields(members[this.data.memberIndex]))
            });
        }
        catch {
            if (epoch !== this.loadEpoch || !session_1.session.isFamily(family.id))
                return;
            if (this.data.members.length === 0) {
                this.setData({
                    members: [],
                    memberOptions: []
                });
            }
        }
    },
    async loadReminders(options = {}) {
        const family = session_1.session.getFamily(), epoch = this.loadEpoch;
        if (!family) {
            wx.redirectTo({ url: "/pages/home/index" });
            return;
        }
        const shouldShowLoading = options.showLoading ?? this.data.reminders.length === 0;
        this.setData({ loading: shouldShowLoading });
        try {
            const response = await api_1.api.listReminders(family.id);
            if (epoch !== this.loadEpoch || !session_1.session.isFamily(family.id))
                return;
            const pendingPlanIds = new Set(response.data
                .filter((reminder) => reminder.planId && !reminder.completedAt)
                .map((reminder) => reminder.planId));
            this.setData({
                reminders: response.data
                    .slice()
                    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))
                    .map((reminder) => withReminderText(reminder, Boolean(reminder.planId && reminder.completedAt && pendingPlanIds.has(reminder.planId)))),
                loading: false
            });
            this.applyReminderFilter();
        }
        catch (error) {
            if (epoch !== this.loadEpoch || !session_1.session.isFamily(family.id))
                return;
            this.setData({ loading: false, refreshing: false, error: "提醒暂时加载失败，请检查网络后重试。" });
            wx.showToast({
                title: "提醒加载失败，请检查网络后重试",
                icon: "none"
            });
        }
    },
    buildReminderBodies(member, creatorId) {
        const type = reminderTypes[this.data.typeIndex]?.value;
        const title = this.data.titleInput.trim();
        const frequency = frequencyOptions[this.data.frequencyIndex] ?? frequencyOptions[0];
        const dueAt = normalizeDueAt(this.data.dueAtInput.trim());
        if (!type || !title || !dueAt)
            return [];
        if (type === "birthday") {
            if (!(0, birthday_1.validBirthday)(this.data.birthdayDateInput.trim(), this.data.birthdayCalendar))
                return [];
            return [{ type, title, dueAt, createdByMemberId: creatorId, assigneeMemberId: member.id,
                    targetScope: "member", targetMemberIds: [creatorId], frequency: "yearly",
                    schedule: { birthdayDate: this.data.birthdayDateInput.trim(), birthdayCalendar: this.data.birthdayCalendar,
                        birthdayLeapMonth: this.data.birthdayCalendar === 'lunar' && this.data.birthdayLeapMonth, advanceDays: advanceDayOptions[this.data.advanceDayIndex]?.value ?? 0,
                        notifyOnDay: this.data.notifyOnBirthday, targetLabel: memberName(member), frequencyLabel: this.data.birthdayCalendar === 'lunar' && this.data.birthdayLeapMonth ? '对应闰月' : '每年' } }];
        }
        const targetScope = type === "exercise" ? targetScopeOptions[this.data.targetScopeIndex]?.value ?? "member" : "member";
        return [{ type, title, dueAt, createdByMemberId: creatorId, assigneeMemberId: member.id,
                targetScope, targetMemberIds: targetScope === "member" ? [member.id] : undefined,
                frequency: frequency.value, schedule: { timesOfDay: frequency.value === "daily_once" ? [this.data.dueAtInput.slice(11, 16)] : frequency.timesOfDay, frequencyLabel: frequency.label,
                    targetLabel: targetScope === "family" ? "全家" : memberName(member) } }];
    },
    async onCreateReminder() {
        if (this.data.busy)
            return;
        const family = session_1.session.getFamily();
        const creator = session_1.session.getMember();
        const selectedMember = this.data.members[this.data.memberIndex] ?? creator;
        if (!family || !creator) {
            wx.showToast({
                title: "请先创建家庭",
                icon: "none"
            });
            return;
        }
        if (!selectedMember) {
            wx.showToast({
                title: "请先添加家庭成员",
                icon: "none"
            });
            return;
        }
        const reminderBodies = this.buildReminderBodies(selectedMember, creator.id);
        if (reminderBodies.length === 0) {
            wx.showToast({
                title: "请补全提醒设置",
                icon: "none"
            });
            return;
        }
        this.setData({ busy: true });
        wx.showLoading({ title: "保存中" });
        try {
            let acceptedSubscription = false;
            const fanoutFamilyReminder = reminderBodies.length > 1 &&
                reminderBodies.every((reminderBody) => reminderBody.type === "exercise") &&
                targetScopeOptions[this.data.targetScopeIndex]?.value === "family";
            const createRequests = [];
            for (const reminderBody of reminderBodies) {
                const shouldAttachNotification = reminderBody.targetScope === "family" || Boolean(reminderBody.targetMemberIds?.includes(creator.id));
                const subscription = shouldAttachNotification
                    ? await (0, wechat_1.requestReminderSubscription)(reminderBody.type)
                    : undefined;
                acceptedSubscription = acceptedSubscription || subscription?.subscriptionStatus === "accept";
                createRequests.push(api_1.api.createReminder(family.id, {
                    ...reminderBody,
                    notificationSubscription: subscription
                        ? {
                            templateId: subscription.templateId,
                            recipientMemberId: creator.id,
                            subscriptionStatus: subscription.subscriptionStatus
                        }
                        : undefined
                }));
            }
            await Promise.all(createRequests);
            wx.hideLoading();
            this.setData({
                titleInput: reminderTypes[this.data.typeIndex]?.value === "birthday" ? "家人生日" : reminderTypes[this.data.typeIndex]?.value === "exercise" ? "提醒运动" : "提醒吃药",
                ...(this.data.filter !== "all" ? { filter: this.data.typeIndex === 0 ? "birthday" : "health" } : {}), formVisible: false, birthdayInputDirty: false, dueAtInput: defaultDueAtInput(), dateInput: defaultDueAtInput().slice(0, 10), timeInput: "08:00"
            });
            void this.loadPage({ force: true, showLoading: false });
            wx.showToast({
                title: acceptedSubscription ? "提醒已保存，请留意通知状态" : "提醒已保存",
                icon: "success"
            });
        }
        catch (error) {
            wx.hideLoading();
            if (isAuthReminderError(error)) {
                session_1.session.clear();
                wx.showToast({
                    title: "登录已失效，请重新进入家庭",
                    icon: "none"
                });
                wx.redirectTo({ url: "/pages/home/index" });
                return;
            }
            wx.showToast({
                title: "保存失败，请检查网络后重试",
                icon: "none"
            });
        }
        finally {
            this.setData({ busy: false });
        }
    },
    async onSubscribeReminder(event) {
        if (this.data.busy)
            return;
        const family = session_1.session.getFamily();
        const id = event.currentTarget.dataset.id;
        const reminder = this.data.reminders.find(item => item.id === id);
        if (!family || !reminder)
            return;
        this.setData({ busy: true });
        try {
            const subscription = await (0, wechat_1.requestReminderSubscription)(reminder.type);
            if (!subscription) {
                wx.showToast({ title: "通知暂不可用", icon: "none" });
                return;
            }
            await api_1.api.subscribeReminder(family.id, id, subscription);
            await this.loadPage({ force: true, showLoading: false });
            wx.showToast({ title: subscription.subscriptionStatus === 'accept' ? '本次通知已授权' : '本次未授权，不会发送', icon: "none" });
        }
        catch {
            wx.showToast({ title: "授权未更新，请检查是否有待发送通知", icon: "none" });
        }
        finally {
            this.setData({ busy: false });
        }
    },
    onShareAppMessage() { return (0, discovery_1.publicProductShare)(); },
    async onCompleteReminder(event) {
        if (this.data.busy)
            return;
        const member = session_1.session.getMember();
        const reminderId = event.currentTarget.dataset.id;
        if (!member || !reminderId) {
            wx.showToast({
                title: "请先创建家庭",
                icon: "none"
            });
            return;
        }
        this.setData({ busy: true });
        try {
            await api_1.api.completeReminder(reminderId, {
                actorMemberId: member.id
            });
            await this.loadPage({ force: true, showLoading: false });
            wx.showToast({
                title: "已标记完成",
                icon: "success"
            });
        }
        catch (error) {
            wx.showToast({
                title: "操作失败，请稍后再试",
                icon: "none"
            });
        }
        finally {
            this.setData({ busy: false });
        }
    }
});
