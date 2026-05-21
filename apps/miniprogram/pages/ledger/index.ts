import { api, type LedgerCategory, type LedgerEntry, type LedgerEntryType } from "../../utils/api";
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

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const amountToCents = (value: string) => {
  const normalized = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return undefined;
  }

  return Math.round(Number(normalized) * 100);
};

const formatAmount = (entry: LedgerEntry) => {
  const sign = entry.type === "income" ? "+" : "-";

  return `${sign}${(entry.amountCents / 100).toFixed(2)} 元`;
};

const categoryLabel = (category: LedgerCategory) => categories.find((item) => item.value === category)?.label ?? "其他";

const withLedgerText = (entry: LedgerEntry) => ({
  ...entry,
  amountText: formatAmount(entry),
  typeLabel: entry.type === "income" ? "收入" : "支出",
  categoryLabel: categoryLabel(entry.category),
  occurredAtText: formatDate(new Date(entry.occurredAt)),
  isIncome: entry.type === "income"
});

Page({
  data: {
    entryTypes,
    categories,
    typeIndex: 0,
    categoryIndex: 0,
    titleInput: "家庭日常支出",
    amountInput: "20",
    occurredAtInput: formatDate(new Date()),
    ledgerEntries: [] as Array<
      LedgerEntry & {
        amountText: string;
        typeLabel: string;
        categoryLabel: string;
        occurredAtText: string;
        isIncome: boolean;
      }
    >,
    loading: false
  },

  onShow() {
    void this.loadLedgerEntries();
  },

  onTypeChange(event: WechatMiniprogram.PickerChange) {
    const typeIndex = Number(event.detail.value);

    this.setData({
      typeIndex,
      titleInput: entryTypes[typeIndex]?.value === "income" ? "家庭收入" : "家庭日常支出"
    });
  },

  onCategoryChange(event: WechatMiniprogram.PickerChange) {
    this.setData({
      categoryIndex: Number(event.detail.value)
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
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
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
    const occurredAt = new Date(`${this.data.occurredAtInput.trim()}T00:00:00`).toISOString();
    const entryType = entryTypes[this.data.typeIndex]?.value;
    const category = categories[this.data.categoryIndex]?.value;

    if (!family || !member) {
      wx.showToast({
        title: "请先创建家庭",
        icon: "none"
      });
      return;
    }

    if (!title || !amountCents || !entryType || !category || Number.isNaN(Date.parse(occurredAt))) {
      wx.showToast({
        title: "请填写金额、标题和日期",
        icon: "none"
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
        occurredAt
      });

      wx.hideLoading();
      this.setData({
        titleInput: entryType === "income" ? "家庭收入" : "家庭日常支出",
        amountInput: "20",
        occurredAtInput: formatDate(new Date())
      });
      await this.loadLedgerEntries();
      wx.showToast({
        title: "已记一笔",
        icon: "success"
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "保存失败，请确认 API 已启动",
        icon: "none"
      });
    }
  }
});
