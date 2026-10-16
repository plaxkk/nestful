"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const session_1 = require("../../utils/session");
const wechat_1 = require("../../utils/wechat");
Page({
    data: {
        familyNameInput: "我的家庭"
    },
    onFamilyNameInput(event) {
        this.setData({
            familyNameInput: event.detail.value
        });
    },
    onBack() {
        wx.navigateBack();
    },
    async onCreateFamily() {
        const familyName = this.data.familyNameInput.trim();
        if (!familyName) {
            wx.showToast({
                title: "请先写家庭名字",
                icon: "none"
            });
            return;
        }
        wx.showLoading({ title: "创建中" });
        try {
            const identity = await (0, wechat_1.getWechatIdentity)();
            const user = session_1.session.getUser();
            const ownerDisplayName = user && user.nickname !== "微信用户" ? user.nickname : "家庭管理员";
            const response = await api_1.api.createFamily({
                name: familyName,
                ownerUserId: identity.userId,
                ownerWechatOpenId: identity.wechatOpenId,
                ownerDisplayName
            });
            session_1.session.setFamily(response.data.family);
            session_1.session.setMember(response.data.ownerMember);
            session_1.session.setMembers(response.data.family.id, [response.data.ownerMember]);
            wx.hideLoading();
            wx.redirectTo({ url: "/pages/family/index?welcome=1" });
        }
        catch (error) {
            wx.hideLoading();
            wx.showToast({
                title: "创建失败，请稍后重试",
                icon: "none"
            });
        }
    }
});
