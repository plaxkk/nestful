"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const session_1 = require("../../utils/session");
const wechat_1 = require("../../utils/wechat");
Page({
    data: { code: '', codeInput: '', displayName: '', invitationStatus: '正在检查邀请', familyName: '', pending: false, busy: false, requiresApproval: false, fromCard: false, agreed: false },
    targetActivityId: '',
    onLoad(query) {
        this.targetActivityId = query.activityId ?? '';
        const code = query.code ?? '';
        this.setData({ code, codeInput: code, fromCard: Boolean(code) });
        if (code)
            void this.loadInvitation(code);
        else
            this.setData({ invitationStatus: '请填写管理员发来的邀请码' });
    },
    onCodeInput(e) { this.setData({ codeInput: e.detail.value, code: e.detail.value.trim(), pending: false, invitationStatus: '请检查新邀请码' }); },
    onDisplayNameInput(e) { this.setData({ displayName: e.detail.value }); },
    onAgreementChange(e) { this.setData({ agreed: e.detail.value.includes('agree') }); },
    onOpenHelp() { wx.navigateTo({ url: '/pages/help/index' }); },
    onCheckInvitation() { const code = this.data.codeInput.trim(); if (code)
        void this.loadInvitation(code); },
    async loadInvitation(code) {
        try {
            const r = (await api_1.api.getInvitation(code)).data;
            this.setData({ familyName: r.familyName, requiresApproval: Boolean(r.requiresApproval), invitationStatus: r.status === 'active' ? `邀请你加入「${r.familyName}」` : r.status === 'full' ? '邀请人数已满，请联系管理员' : '邀请已失效或已使用，请联系管理员' });
        }
        catch (error) {
            this.setData({ invitationStatus: (0, api_1.errorMessage)(error, '邀请暂不可用，请检查后重试') });
        }
    },
    async enterFamily(family, member) {
        session_1.session.setFamily(family);
        session_1.session.setMember(member);
        session_1.session.setMembers(family.id, [member]);
        const url = this.targetActivityId ? `/pages/activities/index?familyId=${family.id}&activityId=${encodeURIComponent(this.targetActivityId)}` : '/pages/home/index?current=1';
        wx.redirectTo({ url });
    },
    async onRefreshStatus() {
        if (this.data.busy)
            return;
        this.setData({ busy: true });
        try {
            await (0, wechat_1.getWechatIdentity)();
            const r = (await api_1.api.getJoinStatus(this.data.codeInput.trim())).data;
            if (r.status === 'joined' && r.family && r.member) {
                await this.enterFamily(r.family, r.member);
                return;
            }
            this.setData({ pending: r.status === 'pending', invitationStatus: r.status === 'pending' ? '申请已提交，等待管理员同意' : r.status === 'rejected' ? '管理员未通过申请，请联系邀请人' : r.status === 'new' ? '还没有提交申请' : '邀请已失效，请联系管理员' });
        }
        catch (error) {
            wx.showToast({ title: (0, api_1.errorMessage)(error), icon: 'none' });
        }
        finally {
            this.setData({ busy: false });
        }
    },
    async onJoinFamily() {
        if (this.data.busy)
            return;
        const code = this.data.codeInput.trim(), displayName = this.data.displayName.trim();
        if (!code || !displayName) {
            wx.showToast({ title: '请填写邀请码和你的称呼', icon: 'none' });
            return;
        }
        if (!this.data.agreed) {
            wx.showToast({ title: '请先阅读并同意隐私说明', icon: 'none' });
            return;
        }
        this.setData({ busy: true });
        try {
            const identity = await (0, wechat_1.getWechatIdentity)();
            const r = (await api_1.api.acceptInvitation(code, { displayName, userId: identity.userId })).data;
            if (r.status === 'pending') {
                this.setData({ pending: true, invitationStatus: '申请已提交，请让管理员在家庭首页同意' });
                return;
            }
            await this.enterFamily(r.family, r.member);
        }
        catch (error) {
            wx.showToast({ title: (0, api_1.errorMessage)(error, '加入暂未完成，请检查网络后重试'), icon: 'none' });
        }
        finally {
            this.setData({ busy: false });
        }
    }
});
