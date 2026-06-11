import {
  api,
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
  isIncome: entry.type === "income"
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
    entryTypes,
    categories,
    recurrenceOptions,
    typeIndex: 0,
    categoryIndex: 0,
    splitMemberIndex: 0,
    recurrenceIndex: 0,
    titleInput: "家庭日常支出",
    amountInput: "20",
    occurredAtInput: formatDate(new Date()),
    goalTitleInput: "家庭旅行基金",
    goalTargetInput: "1000",
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

  onShow() {
    void this.loadLedgerData();
  },

  onTypeChange(event: WechatMiniprogram.PickerChange) {
    const typeIndex = Number(event.detail.value);

    this.setData({
      typeIndex,
      recurrenceIndex: entryTypes[typeIndex]?.value === "income" ? 0 : this.data.recurrenceIndex,
      titleInput: entryTypes[typeIndex]?.value === "income" ? "家庭收入" : "家庭日常支出"
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
      !options.force &&
      this.data.lastLoadedAt > 0 &&
      Date.now() - this.data.lastLoadedAt < pageRefreshIntervalMs
    ) {
      return;
    }

    if (this.data.refreshing && !options.force) {
      return;
    }

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
      refreshing: true
    });

    try {
      const [membersResponse, entriesResponse, summaryResponse] = await Promise.all([
        api.listMembers(family.id),
        api.listLedgerEntries(family.id),
        api.getLedgerSummary(family.id)
      ]);
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
      this.setData({ loading: false, refreshing: false });
      wx.showToast({
        title: "账本加载失败，请确认 API 已启动",
        icon: "none"
      });
    }
  },

  async onCreateLedgerEntry() {
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
        titleInput: entryType === "income" ? "家庭收入" : "家庭日常支出",
        amountInput: "20",
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
        title: "保存失败，请确认 API 已启动",
        icon: "none"
      });
    }
  },

  async onCreateGoalFund() {
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
        goalTitleInput: "家庭旅行基金",
        goalTargetInput: "1000",
        goalCurrentInput: "0",
        goalDueAtInput: ""
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
    }
  }
});
