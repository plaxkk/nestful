const { api } = require("./api");
const { session } = require("./session");

const getWechatIdentity = () =>
  new Promise((resolve) => {
    wx.login({
      success: async (loginResult) => {
        if (!loginResult.code) {
          resolve({ userId: `local-${Date.now()}` });
          return;
        }

        try {
          const response = await api.createWechatSession({ code: loginResult.code });
          session.setToken(response.data.token);
          resolve({
            userId: response.data.userId,
            wechatOpenId: response.data.wechatOpenId,
          });
        } catch {
          resolve({ userId: `local-${Date.now()}` });
        }
      },
      fail: () => {
        resolve({ userId: `local-${Date.now()}` });
      },
    });
  });

const requestReminderSubscription = async (type) => {
  try {
    const response = await api.getReminderSubscriptionConfig(type);
    const templateId = response.data.templateId;

    if (!response.data.enabled || !templateId || !wx.requestSubscribeMessage) {
      return undefined;
    }

    return await new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: [templateId],
        success: (result) => {
          resolve({
            templateId,
            subscriptionStatus: result[templateId] || "reject",
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
  } catch {
    return undefined;
  }
};

module.exports = {
  getWechatIdentity,
  requestReminderSubscription,
};
