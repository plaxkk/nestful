import { api, type FamilyMembership } from "../../utils/api";
import { session } from "../../utils/session";
import { getWechatIdentity } from "../../utils/wechat";

const homeRefreshIntervalMs = 30 * 1000;

Page({
  data: {
    hasFamily: false,
    primaryText: "创建我的家庭",
    families: [] as Array<FamilyMembership & { id: string }>,
    currentFamilyId: "",
    restoring: false,
    lastRestoredAt: 0
  },

  restoreEpoch: 0,

  onShow() {
    this.restoreEpoch += 1;
    this.syncHomeState();
    void this.restoreFamilySession();
  },

  onHide() {
    this.restoreEpoch += 1;
    this.setData({ restoring: false });
  },

  syncHomeState() {
    const family = session.getFamily();
    const member = session.getMember();
    const hasFamily = Boolean(family);
    const families = [...this.data.families];
    if (family && member && member.familyId === family.id && !families.some(item => item.family.id === family.id)) {
      families.unshift({ id: family.id, family, member, members: session.getMembers(family.id) });
    }
    this.setData({
      hasFamily,
      families,
      currentFamilyId: family ? family.id : "",
      primaryText: hasFamily ? "打开我的家庭" : "创建我的家庭"
    });
  },

  async restoreFamilySession() {
    if (this.data.restoring) {
      return;
    }

    if (this.data.lastRestoredAt > 0 && Date.now() - this.data.lastRestoredAt < homeRefreshIntervalMs) {
      return;
    }

    const epoch = this.restoreEpoch;
    this.setData({ restoring: true });

    try {
      await getWechatIdentity();
      if (epoch !== this.restoreEpoch) return;
      const response = await api.listMyFamilies();
      if (epoch !== this.restoreEpoch) return;
      const currentFamily = session.getFamily();
      const membership = response.data.find(item => currentFamily && item.family.id === currentFamily.id) ?? response.data[0];

      if (!membership) {
        this.syncHomeState();
        this.setData({
          restoring: false,
          lastRestoredAt: Date.now()
        });
        return;
      }

      session.setFamily(membership.family);
      session.setMember(membership.member);
      session.setMembers(membership.family.id, membership.members);
      this.setData({
        hasFamily: true,
        families: response.data.map(item => ({ ...item, id: item.family.id })),
        currentFamilyId: membership.family.id,
        primaryText: "打开我的家庭",
        restoring: false,
        lastRestoredAt: Date.now()
      });
    } catch {
      if (epoch !== this.restoreEpoch) return;
      this.syncHomeState();
      this.setData({ restoring: false });
    }
  },

  onCreateFamily() {
    wx.navigateTo({ url: "/pages/create-family/index" });
  },

  onSelectFamily(event: WechatMiniprogram.TouchEvent) {
    const membership = this.data.families.find(item => item.family.id === event.currentTarget.dataset.id);
    if (!membership) return;
    session.setFamily(membership.family);
    session.setMember(membership.member);
    session.setMembers(membership.family.id, membership.members);
    wx.navigateTo({ url: "/pages/family/index" });
  },

  onPrimaryAction() {
    if (this.data.hasFamily) {
      wx.navigateTo({ url: "/pages/family/index" });
      return;
    }

    wx.navigateTo({ url: "/pages/create-family/index" });
  },

  onJoinFamily() {
    wx.navigateTo({ url: "/pages/join/index" });
  }
});
