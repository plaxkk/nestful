import {
  api,
  errorMessage,
  type FamilyMember,
  type LedgerCategory,
  type LedgerEntry,
  type LedgerEntryType,
  type LedgerMonthlySummary,
  type LedgerRecurrence
} from "../../utils/api";
import { session } from "../../utils/session";

const entryTypes: Array<{ label: string; value: LedgerEntryType }> = [
  { label: "支出", value: "expense" },
  { label: "收入", value: "income" }
];

const categories: Array<{ label: string; value: LedgerCategory }> = [
  { label: "日常", value: "daily" },
  { label: "教育", value: "education" },
  { label: "健康", value: "health" },
  { label: "旅行", value: "travel" },
  { label: "住房", value: "housing" },
  { label: "会员", value: "subscription" },
  { label: "其他", value: "other" }
];

const recurrenceOptions: Array<{ label: string; value?: LedgerRecurrence }> = [
  { label: "不生成提醒" },
  { label: "每月续费", value: "monthly" },
  { label: "每年续费", value: "yearly" }
];

const pageRefreshIntervalMs = 30 * 1000;

type LoadOptions = {
  force?: boolean;
  showLoading?: boolean;
};

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseDateInput = (value: string) => {
  const parsed = new Date(`${value.trim()}T00:00:00`);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const amountToCents = (value: string) => {
  const normalized = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return undefined;
  }

  return Math.round(Number(normalized) * 100);
};

const formatCents = (amountCents: number) => `${(amountCents / 100).toFixed(2)} 元`;

const formatAmount = (entry: LedgerEntry) => {
  const sign = entry.type === "income" ? "+" : "-";

  return `${sign}${formatCents(entry.amountCents)}`;
};

const categoryLabel = (category: LedgerCategory) => categories.find((item) => item.value === category)?.label ?? "其他";

const memberName = (members: FamilyMember[], memberId: string) =>
  members.find((member) => member.id === memberId)?.displayName ?? "家人";

const recurrenceLabel = (recurrence?: LedgerRecurrence) =>
  recurrenceOptions.find((item) => item.value === recurrence)?.label ?? "";

const withLedgerText = (entry: LedgerEntry, members: FamilyMember[]) => ({
  ...entry,
  amountText: formatAmount(entry),
  typeLabel: entry.type === "income" ? "收入" : "支出",
  categoryLabel: categoryLabel(entry.category),
  occurredAtText: formatDate(new Date(entry.occurredAt)),
  paidByText: memberName(members, entry.paidByMemberId),
  splitText: entry.splitMemberIds.map((memberId) => memberName(members, memberId)).join("、"),
  recurrenceText: recurrenceLabel(entry.recurrence),
  isIncome: entry.type === "income",
  canManage:Boolean((session.getMember()||{role:''}).role==='admin'||entry.createdByMemberId===(session.getMember()||{id:''}).id)
});

const emptySummary = () => ({
  month: "",
  incomeText: "0.00 元",
  expenseText: "0.00 元",
  balanceText: "0.00 元",
  recordCountText: "0 笔",
  categoryTotals: [] as Array<{ category: LedgerCategory; label: string; amountText: string; entryCountText: string }>,
  memberSplits: [] as Array<{
    memberId: string;
    displayName: string;
    paidText: string;
    owedText: string;
    balanceText: string;
    balanceClass: string;
  }>,
  goalFunds: [] as Array<{
    id: string;
    title: string;
    targetText: string;
    currentText: string;
    progressText: string;
    dueAtText: string;
  }>
});

const withSummaryText = (summary: LedgerMonthlySummary, members: FamilyMember[]) => ({
  month: summary.month,
  incomeText: formatCents(summary.incomeCents),
  expenseText: formatCents(summary.expenseCents),
  balanceText: formatCents(summary.balanceCents),
  recordCountText: `${summary.entryCount} 笔`,
  categoryTotals: summary.categoryTotals.map((item) => ({
    category: item.category,
    label: categoryLabel(item.category),
    amountText: formatCents(item.amountCents),
    entryCountText: `${item.entryCount} 笔`
  })),
  memberSplits: summary.memberSplits.map((item) => ({
    memberId: item.memberId,
    displayName: memberName(members, item.memberId),
    paidText: formatCents(item.paidCents),
    owedText: formatCents(item.owedCents),
    balanceText: formatCents(item.balanceCents),
    balanceClass: item.balanceCents >= 0 ? "income" : "expense"
  })),
  goalFunds: summary.goalFunds.map((goal) => ({
    id: goal.id,
    title: goal.title,
    targetText: formatCents(goal.targetAmountCents),
    currentText: formatCents(goal.currentAmountCents),
    progressText: `${Math.min(100, Math.round((goal.currentAmountCents / goal.targetAmountCents) * 100))}%`,
    dueAtText: goal.dueAt ? formatDate(new Date(goal.dueAt)) : "未设置日期"
  }))
});

const statusCodeFromError = (error: unknown) => {
  if (typeof error === "object" && error && "statusCode" in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;

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

const isAuthLedgerError = (error: unknown) => {
  const statusCode = statusCodeFromError(error);

  return statusCode === 401 || statusCode === 403;
};

const handleAuthLedgerError = () => {
  session.clear();
  wx.showToast({
    title: "登录已失效，请重新进入家庭",
    icon: "none"
  });
  wx.redirectTo({ url: "/pages/home/index" });
};

Page({
  data: {
    busy:false, formVisible:false, goalFormVisible:false, analysisVisible:false, familyName:"", error:"",
    editingEntry:null as LedgerEntry|null,
    editTitleInput:'',editAmountInput:'',editDateInput:'',editCategoryIndex:0,
    entryTypes,
    categories,
    recurrenceOptions,
    typeIndex: 0,
    categoryIndex: 0,
    splitMemberIndex: 0,
    recurrenceIndex: 0,
    titleInput: "",
    amountInput: "",
    occurredAtInput: formatDate(new Date()),
    goalTitleInput: "",
    goalTargetInput: "",
    goalCurrentInput: "0",
    goalDueAtInput: "",
    members: [] as FamilyMember[],
    splitOptions: ["仅自己"] as string[],
    ledgerEntries: [] as Array<
      LedgerEntry & {
        amountText: string;
        typeLabel: string;
        categoryLabel: string;
        occurredAtText: string;
        paidByText: string;
        splitText: string;
        recurrenceText: string;
        isIncome: boolean;
      }
    >,
    summary: emptySummary(),
    loading: false,
    refreshing: false,
    lastLoadedAt: 0
  },

  currentFamilyId: "", loadEpoch: 0, loadedRevision: -1,
  onShow() {
    const family=session.getFamily();
    if(!family){wx.redirectTo({url:'/pages/home/index'});return;}
    if(this.currentFamilyId!==family.id){this.loadEpoch++;this.setData({members:[],ledgerEntries:[],summary:emptySummary(),lastLoadedAt:0,refreshing:false,editingEntry:null,formVisible:false,goalFormVisible:false,titleInput:'',amountInput:''});this.currentFamilyId=family.id;}
    this.setData({familyName:family.name});void this.loadLedgerData();
  },
  onHide(){this.loadEpoch++;this.setData({refreshing:false,loading:false});},
  onToggleForm(){if(this.data.busy)return;this.setData({formVisible:!this.data.formVisible,editingEntry:null,goalFormVisible:false});wx.pageScrollTo({scrollTop:0,duration:200});},
  onToggleGoalForm(){if(this.data.busy)return;this.setData({goalFormVisible:!this.data.goalFormVisible,formVisible:false,editingEntry:null});wx.pageScrollTo({scrollTop:0,duration:200});},
  onToggleAnalysis(){this.setData({analysisVisible:!this.data.analysisVisible});},
  onOccurredDateChange(e:WechatMiniprogram.PickerChange){this.setData({occurredAtInput:String(e.detail.value)});},
  onGoalDateChange(e:WechatMiniprogram.PickerChange){this.setData({goalDueAtInput:String(e.detail.value)});},
  onRetry(){void this.loadLedgerData({force:true,showLoading:true});},
  onEditEntry(e:WechatMiniprogram.TouchEvent){
    const entry=this.data.ledgerEntries.find(r=>r.id===e.currentTarget.dataset.id);if(!entry)return;
    this.setData({formVisible:false,goalFormVisible:false,editingEntry:entry,editTitleInput:entry.title,editAmountInput:(entry.amountCents/100).toFixed(2),editDateInput:formatDate(new Date(entry.occurredAt)),editCategoryIndex:Math.max(0,categories.findIndex(c=>c.value===entry.category))});wx.pageScrollTo({scrollTop:0,duration:200});
  },
  onCancelEntryEdit(){this.setData({editingEntry:null});},
  onEditTitleInput(e:WechatMiniprogram.Input){this.setData({editTitleInput:e.detail.value});},
  onEditAmountInput(e:WechatMiniprogram.Input){this.setData({editAmountInput:e.detail.value});},
  onEditDateChange(e:WechatMiniprogram.PickerChange){this.setData({editDateInput:String(e.detail.value)});},
  onEditCategoryChange(e:WechatMiniprogram.PickerChange){this.setData({editCategoryIndex:Number(e.detail.value)});},
  async onSaveEntryEdit(){
    const family=session.getFamily(),entry=this.data.editingEntry;if(!family||!entry||this.data.busy)return;
    const title=this.data.editTitleInput.trim(),amountCents=amountToCents(this.data.editAmountInput),occurredAt=parseDateInput(this.data.editDateInput);
    if(!title||!amountCents||!Number.isSafeInteger(amountCents)||!occurredAt){wx.showToast({title:'请检查名称、金额和日期',icon:'none'});return;}
    this.setData({busy:true});
    try{await api.updateLedgerEntry(family.id,entry.id,{...entry,title,amountCents,occurredAt,category:categories[this.data.editCategoryIndex].value});this.setData({editingEntry:null});await this.loadLedgerData({force:true,showLoading:false});wx.showToast({title:'记录已修改',icon:'none'});}
    catch(error){wx.showToast({title:errorMessage(error),icon:'none'});}finally{this.setData({busy:false});}
  },
  async onVoidEntry(e:WechatMiniprogram.TouchEvent){
    const family=session.getFamily(),entry=this.data.ledgerEntries.find(r=>r.id===e.currentTarget.dataset.id);if(!family||!entry||this.data.busy)return;
    const confirmed=await wx.showModal({title:'作废这一笔？',content:entry.recurringReminderId?'这笔不再计入汇总。已有续费提醒会保留，如不再需要，请到提醒页停止计划。':'这笔不再计入汇总，操作记录会保留。'});if(!confirmed.confirm)return;
    this.setData({busy:true});
    try{await api.voidLedgerEntry(family.id,entry.id,entry.version);await this.loadLedgerData({force:true,showLoading:false});wx.showToast({title:'记录已作废',icon:'none'});}
    catch(error){wx.showToast({title:errorMessage(error),icon:'none'});}finally{this.setData({busy:false});}
  },

  onTypeChange(event: WechatMiniprogram.PickerChange) {
    const typeIndex = Number(event.detail.value);

    this.setData({
      typeIndex,
      recurrenceIndex: entryTypes[typeIndex]?.value === "income" ? 0 : this.data.recurrenceIndex,
      titleInput: ""
    });
  },

  onCategoryChange(event: WechatMiniprogram.PickerChange) {
    this.setData({
      categoryIndex: Number(event.detail.value)
    });
  },

  onSplitMemberChange(event: WechatMiniprogram.PickerChange) {
    this.setData({
      splitMemberIndex: Number(event.detail.value)
    });
  },

  onRecurrenceChange(event: WechatMiniprogram.PickerChange) {
    this.setData({
      recurrenceIndex: Number(event.detail.value)
    });
  },

  onTitleInput(event: WechatMiniprogram.Input) {
    this.setData({
      titleInput: event.detail.value
    });
  },

  onAmountInput(event: WechatMiniprogram.Input) {
    this.setData({
      amountInput: event.detail.value
    });
  },

  onOccurredAtInput(event: WechatMiniprogram.Input) {
    this.setData({
      occurredAtInput: event.detail.value
    });
  },

  onGoalTitleInput(event: WechatMiniprogram.Input) {
    this.setData({
      goalTitleInput: event.detail.value
    });
  },

  onGoalTargetInput(event: WechatMiniprogram.Input) {
    this.setData({
      goalTargetInput: event.detail.value
    });
  },

  onGoalCurrentInput(event: WechatMiniprogram.Input) {
    this.setData({
      goalCurrentInput: event.detail.value
    });
  },

  onGoalDueAtInput(event: WechatMiniprogram.Input) {
    this.setData({
      goalDueAtInput: event.detail.value
    });
  },

  async loadLedgerData(options: LoadOptions = {}) {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    if (
      !options.force && this.loadedRevision === session.getHomeRevision() &&
      this.data.lastLoadedAt > 0 &&
      Date.now() - this.data.lastLoadedAt < pageRefreshIntervalMs
    ) {
      return;
    }

    if (this.data.refreshing && !options.force) {
      return;
    }

    const epoch=++this.loadEpoch,revision=session.getHomeRevision();
    const cachedMembers = session.getMembers(family.id);

    if (cachedMembers.length > 0 && this.data.members.length === 0) {
      this.setData({
        members: cachedMembers,
        splitOptions: ["仅自己", ...cachedMembers.map((member) => member.displayName)]
      });
    }

    const shouldShowLoading = options.showLoading ?? this.data.ledgerEntries.length === 0;

    this.setData({
      loading: shouldShowLoading,
      refreshing: true, error:""
    });

    try {
      const [membersResponse, entriesResponse, summaryResponse] = await Promise.all([
        api.listMembers(family.id),
        api.listLedgerEntries(family.id),
        api.getLedgerSummary(family.id)
      ]);
      if(epoch!==this.loadEpoch||!session.isFamily(family.id))return;
      this.loadedRevision=revision;
      const members = membersResponse.data;
      session.setMembers(family.id, members);

      this.setData({
        members,
        splitOptions: ["仅自己", ...members.map((member) => member.displayName)],
        ledgerEntries: entriesResponse.data.map((entry) => withLedgerText(entry, members)),
        summary: withSummaryText(summaryResponse.data, members),
        loading: false,
        refreshing: false,
        lastLoadedAt: Date.now()
      });
    } catch (error) {
      if(epoch!==this.loadEpoch||!session.isFamily(family.id))return;
      this.setData({ loading: false, refreshing: false, error:"账本暂时加载失败，请检查网络后重试。" });
      wx.showToast({
        title: "账本加载失败，请检查网络后重试",
        icon: "none"
      });
    }
  },

  async onCreateLedgerEntry() {
    if(this.data.busy)return;
    const family = session.getFamily();
    const member = session.getMember();
    const title = this.data.titleInput.trim();
    const amountCents = amountToCents(this.data.amountInput);
    const occurredAt = parseDateInput(this.data.occurredAtInput);
    const entryType = entryTypes[this.data.typeIndex]?.value;
    const category = categories[this.data.categoryIndex]?.value;
    const recurrence = recurrenceOptions[this.data.recurrenceIndex]?.value;
    const selectedSplitMember = this.data.members[this.data.splitMemberIndex - 1];

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    if (!title || !amountCents || !entryType || !category || !occurredAt) {
      wx.showToast({
        title: "请填写金额、标题和日期",
        icon: "none"
      });
      return;
    }

    if (recurrence && (entryType !== "expense" || (category !== "housing" && category !== "subscription"))) {
      wx.showToast({
        title: "续费提醒用于住房或会员支出",
        icon: "none"
      });
      return;
    }

    const splitMemberIds = Array.from(new Set([member.id, selectedSplitMember?.id].filter(Boolean) as string[]));

    this.setData({busy:true});
    wx.showLoading({ title: "保存中" });

    try {
      await api.createLedgerEntry(family.id, {
        type: entryType,
        category,
        title,
        amountCents,
        paidByMemberId: member.id,
        splitMemberIds,
        occurredAt,
        recurrence
      });

      wx.hideLoading();
      this.setData({
        titleInput: "", formVisible:false,
        amountInput: "",
        occurredAtInput: formatDate(new Date()),
        splitMemberIndex: 0,
        recurrenceIndex: 0
      });
      await this.loadLedgerData({ force: true, showLoading: false });
      wx.showToast({
        title: "已记一笔",
        icon: "success"
      });
    } catch (error) {
      wx.hideLoading();
      if (isAuthLedgerError(error)) {
        handleAuthLedgerError();
        return;
      }

      wx.showToast({
        title: "保存失败，请检查网络后重试",
        icon: "none"
      });
    } finally{this.setData({busy:false});}
  },

  async onCreateGoalFund() {
    if(this.data.busy)return;
    const family = session.getFamily();
    const member = session.getMember();
    const title = this.data.goalTitleInput.trim();
    const targetAmountCents = amountToCents(this.data.goalTargetInput);
    const currentAmountCents = amountToCents(this.data.goalCurrentInput) ?? 0;
    const dueAt = this.data.goalDueAtInput.trim() ? parseDateInput(this.data.goalDueAtInput) : undefined;

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    if (!title || !targetAmountCents || (this.data.goalDueAtInput.trim() && !dueAt)) {
      wx.showToast({
        title: "请填写目标名称、金额和日期",
        icon: "none"
      });
      return;
    }

    this.setData({busy:true});
    wx.showLoading({ title: "保存中" });

    try {
      await api.createLedgerGoalFund(family.id, {
        title,
        targetAmountCents,
        currentAmountCents,
        createdByMemberId: member.id,
        dueAt
      });

      wx.hideLoading();
      this.setData({
        goalTitleInput: "",
        goalTargetInput: "",
        goalCurrentInput: "0",
        goalDueAtInput: "", goalFormVisible:false
      });
      await this.loadLedgerData({ force: true, showLoading: false });
      wx.showToast({
        title: "目标已保存",
        icon: "success"
      });
    } catch (error) {
      wx.hideLoading();
      if (isAuthLedgerError(error)) {
        handleAuthLedgerError();
        return;
      }

      wx.showToast({
        title: "目标保存失败",
        icon: "none"
      });
    } finally{this.setData({busy:false});}
  }
});
