const { api } = require("./api");
const { session } = require("./session");

const getWechatIdentity = (options) => {
  const cachedUser = session.getUser();

  if (!options?.forceRefresh && cachedUser && session.hasValidToken()) {
    return Promise.resolve({
      userId: cachedUser.id,
      wechatOpenId: cachedUser.wechatOpenId,
    });
  }

  return new Promise((resolve) => {
    wx.login({
      success: async (loginResult) => {
        if (!loginResult.code) {
          resolve({ userId: `local-${Date.now()}` });
          return;
        }

        try {
          const response = await api.createWechatSession({ code: loginResult.code });
          session.setToken(response.data.token, response.data.expiresAt);
          session.setUser(response.data.user);
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
};

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
