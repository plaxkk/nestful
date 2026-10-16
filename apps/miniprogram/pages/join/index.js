"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const session_1 = require("../../utils/session");
const wechat_1 = require("../../utils/wechat");
Page({
    data: {
        code: "",
        codeInput: "",
        displayName: "",
        invitationStatus: "待验证"
    },
    onLoad(query) {
        const code = query.code ?? "";
        this.setData({ code, codeInput: code });
        if (code) {
            void this.loadInvitation(code);
        }
        else {
            this.setData({
                invitationStatus: "缺少邀请码"
            });
        }
    },
    onDisplayNameInput(event) {
        this.setData({
            displayName: event.detail.value
        });
    },
    onCodeInput(event) {
        this.setData({
            codeInput: event.detail.value,
            code: event.detail.value.trim(),
            invitationStatus: event.detail.value.trim() ? "待验证" : "缺少邀请码"
        });
    },
    onCheckInvitation() {
        const code = this.data.codeInput.trim();
        if (!code) {
            this.setData({
                invitationStatus: "缺少邀请码"
            });
            return;
        }
        this.setData({ code });
        void this.loadInvitation(code);
    },
    async loadInvitation(code) {
        try {
            const response = await api_1.api.getInvitation(code);
            this.setData({
                invitationStatus: response.data.status === "active" ? `邀请有效：${response.data.familyName}` : response.data.status === "accepted" ? "邀请已使用" : "邀请已失效"
            });
        }
        catch (error) {
            this.setData({
                invitationStatus: "邀请无效"
            });
        }
    },
    async onJoinFamily() {
        const displayName = this.data.displayName.trim();
        const code = this.data.codeInput.trim() || this.data.code;
        if (!code) {
            wx.showToast({
                title: "请先输入邀请码",
                icon: "none"
            });
            return;
        }
        if (!displayName) {
            wx.showToast({
                title: "请填写称呼",
                icon: "none"
            });
            return;
        }
        wx.showLoading({ title: "加入中" });
        try {
            const identity = await (0, wechat_1.getWechatIdentity)();
            const response = await api_1.api.acceptInvitation(code, {
                displayName,
                userId: identity.userId,
                wechatOpenId: identity.wechatOpenId
            });
            wx.hideLoading();
            session_1.session.setMember(response.data.member);
            session_1.session.setMembers(response.data.member.familyId, [response.data.member]);
            try {
                const familyResponse = await api_1.api.getFamily(response.data.member.familyId);
                session_1.session.setFamily(familyResponse.data);
            }
            catch {
                session_1.session.setFamily({
                    id: response.data.member.familyId,
                    name: "我的家庭",
                    ownerUserId: "",
                    version: 1,
                    createdAt: ""
                });
            }
            wx.redirectTo({ url: "/pages/family/index" });
        }
        catch (error) {
            wx.hideLoading();
            wx.showToast({
                title: "加入失败，请让家人重新发送邀请",
                icon: "none"
            });
        }
    }
});
