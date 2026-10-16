"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const session_1 = require("../../utils/session");
Page({
    data: { reference: '', busy: false },
    onShow() { const user = session_1.session.getUser(), family = session_1.session.getFamily(); this.setData({ reference: `用户：${user ? user.id : '尚未登录'}\n家庭：${family ? family.name + ' (' + family.id + ')' : '未选择家庭'}` }); },
    onCopyReference() { wx.setClipboardData({ data: this.data.reference }); },
    async onLogout() {
        if (this.data.busy)
            return;
        const confirmed = await wx.showModal({ title: '退出登录？', content: '只退出本机登录，不会退出家庭，也不会删除家庭资料。' });
        if (!confirmed.confirm)
            return;
        this.setData({ busy: true });
        try {
            if (session_1.session.getToken())
                await api_1.api.logout();
            session_1.session.clear();
            wx.reLaunch({ url: '/pages/home/index?loggedOut=1' });
        }
        catch (error) {
            wx.showToast({ title: (0, api_1.errorMessage)(error), icon: 'none' });
        }
        finally {
            this.setData({ busy: false });
        }
    }
});
