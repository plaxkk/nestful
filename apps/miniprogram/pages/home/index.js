"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const session_1 = require("../../utils/session");
const wechat_1 = require("../../utils/wechat");
const homeRefreshIntervalMs = 30 * 1000;
Page({
    data: {
        hasFamily: false,
        primaryText: "创建我的家庭",
        restoring: false,
        lastRestoredAt: 0
    },
    onShow() {
        this.syncHomeState();
        void this.restoreFamilySession();
    },
    syncHomeState() {
        const hasFamily = Boolean(session_1.session.getFamily());
        this.setData({
            hasFamily,
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
        this.setData({ restoring: true });
        try {
            await (0, wechat_1.getWechatIdentity)();
            const response = await api_1.api.listMyFamilies();
            const membership = response.data[0];
            if (!membership) {
                this.syncHomeState();
                this.setData({
                    restoring: false,
                    lastRestoredAt: Date.now()
                });
                return;
            }
            session_1.session.setFamily(membership.family);
            session_1.session.setMember(membership.member);
            session_1.session.setMembers(membership.family.id, membership.members);
            this.setData({
                hasFamily: true,
                primaryText: "打开我的家庭",
                restoring: false,
                lastRestoredAt: Date.now()
            });
        }
        catch {
            this.syncHomeState();
            this.setData({ restoring: false });
        }
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
