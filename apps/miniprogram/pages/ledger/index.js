const { api } = require("../../utils/api");
const { session } = require("../../utils/session");

const entryTypes = [
  { label: "支出", value: "expense" },
  { label: "收入", value: "income" },
];

const categories = [
  { label: "日常", value: "daily" },
  { label: "教育", value: "education" },
  { label: "健康", value: "health" },
  { label: "旅行", value: "travel" },
  { label: "住房", value: "housing" },
  { label: "会员", value: "subscription" },
  { label: "其他", value: "other" },
];

const pad = (value) => value.toString().padStart(2, "0");

const formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const amountToCents = (value) => {
  const normalized = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return undefined;
  }

  return Math.round(Number(normalized) * 100);
};

const formatAmount = (entry) => {
  const sign = entry.type === "income" ? "+" : "-";

  return `${sign}${(entry.amountCents / 100).toFixed(2)} 元`;
};

const categoryLabel = (category) => categories.find((item) => item.value === category)?.label ?? "其他";

const withLedgerText = (entry) => ({
  ...entry,
  amountText: formatAmount(entry),
  typeLabel: entry.type === "income" ? "收入" : "支出",
  categoryLabel: categoryLabel(entry.category),
  occurredAtText: formatDate(new Date(entry.occurredAt)),
  isIncome: entry.type === "income",
});

const summarizeLedger = (entries) => {
  const incomeCents = entries
    .filter((entry) => entry.type === "income")
    .reduce((total, entry) => total + entry.amountCents, 0);
  const expenseCents = entries
    .filter((entry) => entry.type === "expense")
    .reduce((total, entry) => total + entry.amountCents, 0);

  return {
    incomeText: `${(incomeCents / 100).toFixed(2)} 元`,
    expenseText: `${(expenseCents / 100).toFixed(2)} 元`,
    balanceText: `${((incomeCents - expenseCents) / 100).toFixed(2)} 元`,
    recordCountText: `${entries.length} 笔`,
  };
};

Page({
  data: {
    entryTypes,
    categories,
    typeIndex: 0,
    categoryIndex: 0,
    titleInput: "家庭日常支出",
    amountInput: "20",
    occurredAtInput: formatDate(new Date()),
    ledgerEntries: [],
    summary: summarizeLedger([]),
    loading: false,
  },

  onShow() {
    this.loadLedgerEntries();
  },

  onTypeChange(event) {
    const typeIndex = Number(event.detail.value);

    this.setData({
      typeIndex,
      titleInput: entryTypes[typeIndex]?.value === "income" ? "家庭收入" : "家庭日常支出",
    });
  },

  onCategoryChange(event) {
    this.setData({
      categoryIndex: Number(event.detail.value),
    });
  },

  onTitleInput(event) {
    this.setData({
      titleInput: event.detail.value,
    });
  },

  onAmountInput(event) {
    this.setData({
      amountInput: event.detail.value,
    });
  },

  onOccurredAtInput(event) {
    this.setData({
      occurredAtInput: event.detail.value,
    });
  },

  async loadLedgerEntries() {
    const family = session.getFamily();

    if (!family) {
      wx.redirectTo({ url: "/pages/home/index" });
      return;
    }

    this.setData({ loading: true });

    try {
      const response = await api.listLedgerEntries(family.id);

      this.setData({
        ledgerEntries: response.data.map(withLedgerText),
        summary: summarizeLedger(response.data),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: "账本加载失败，请确认 API 已启动",
        icon: "none",
      });
    }
  },

  async onCreateLedgerEntry() {
    const family = session.getFamily();
    const member = session.getMember();
    const title = this.data.titleInput.trim();
    const amountCents = amountToCents(this.data.amountInput);
    const occurredAt = new Date(`${this.data.occurredAtInput.trim()}T00:00:00`).toISOString();
    const entryType = entryTypes[this.data.typeIndex]?.value;
    const category = categories[this.data.categoryIndex]?.value;

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none",
      });
      return;
    }

    if (!title || !amountCents || !entryType || !category || Number.isNaN(Date.parse(occurredAt))) {
      wx.showToast({
        title: "请填写金额、标题和日期",
        icon: "none",
      });
      return;
    }

    wx.showLoading({ title: "保存中" });

    try {
      await api.createLedgerEntry(family.id, {
        type: entryType,
        category,
        title,
        amountCents,
        paidByMemberId: member.id,
        occurredAt,
      });

      wx.hideLoading();
      this.setData({
        titleInput: entryType === "income" ? "家庭收入" : "家庭日常支出",
        amountInput: "20",
        occurredAtInput: formatDate(new Date()),
      });
      await this.loadLedgerEntries();
      wx.showToast({
        title: "已记一笔",
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "保存失败，请确认 API 已启动",
        icon: "none",
      });
    }
  },
});
