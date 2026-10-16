"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestReminderSubscription = exports.getWechatIdentity = void 0;
const api_1 = require("./api");
const session_1 = require("./session");
let pendingIdentity;
const getWechatIdentity = (options) => {
    const cachedUser = session_1.session.getUser();
    if (!options?.forceRefresh && cachedUser && session_1.session.hasValidToken()) {
        return Promise.resolve({
            userId: cachedUser.id,
            wechatOpenId: cachedUser.wechatOpenId,
        });
    }
    pendingIdentity ?? (pendingIdentity = new Promise((resolve, reject) => {
        wx.login({
            success: async (loginResult) => {
                if (!loginResult.code) {
                    reject(new Error("微信登录未取得凭证，请重试"));
                    return;
                }
                try {
                    const response = await api_1.api.createWechatSession({ code: loginResult.code });
                    session_1.session.setToken(response.data.token, response.data.expiresAt);
                    session_1.session.setUser(response.data.user);
                    resolve({
                        userId: response.data.userId,
                        wechatOpenId: response.data.wechatOpenId,
                    });
                }
                catch (error) {
                    reject(error);
                }
            },
            fail: () => {
                reject(new Error("微信登录失败，请重试"));
            },
        });
    }).finally(() => { pendingIdentity = undefined; }));
    return pendingIdentity;
};
exports.getWechatIdentity = getWechatIdentity;
const requestReminderSubscription = async (type) => {
    try {
        const response = await api_1.api.getReminderSubscriptionConfig(type);
        const templateId = response.data.templateId;
        if (!response.data.enabled || !templateId || !wx.requestSubscribeMessage) {
            return undefined;
        }
        return await new Promise((resolve) => {
            wx.requestSubscribeMessage({
                tmplIds: [templateId],
                success: (result) => {
                    const status = result[templateId];
                    resolve({
                        templateId,
                        subscriptionStatus: status ?? "reject",
                    });
                },
                fail: () => {
                    resolve({
                        templateId,
                        subscriptionStatus: "reject",
                    });
                },
            });
        });
    }
    catch {
        return undefined;
    }
};
exports.requestReminderSubscription = requestReminderSubscription;
