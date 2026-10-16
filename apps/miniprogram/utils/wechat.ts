import { api } from "./api";
import type { ReminderType } from "./api";
import { session } from "./session";

export interface WechatIdentity {
  userId: string;
  wechatOpenId?: string;
}
let pendingIdentity: Promise<WechatIdentity> | undefined;

export const getWechatIdentity = (options?: { forceRefresh?: boolean }): Promise<WechatIdentity> => {
  const cachedUser = session.getUser();

  if (!options?.forceRefresh && cachedUser && session.hasValidToken()) {
    return Promise.resolve({
      userId: cachedUser.id,
      wechatOpenId: cachedUser.wechatOpenId,
    });
  }

  pendingIdentity ??= new Promise<WechatIdentity>((resolve, reject) => {
    wx.login({
      success: async (loginResult) => {
        if (!loginResult.code) {
          reject(new Error("微信登录未取得凭证，请重试"));
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
        } catch (error) {
          reject(error);
        }
      },
      fail: () => {
        reject(new Error("微信登录失败，请重试"));
      },
    });
  }).finally(() => { pendingIdentity = undefined; });
  return pendingIdentity;
};

export const requestReminderSubscription = async (type: ReminderType) => {
  try {
    const response = await api.getReminderSubscriptionConfig(type);
    const templateId = response.data.templateId;

    if (!response.data.enabled || !templateId || !wx.requestSubscribeMessage) {
      return undefined;
    }

    return await new Promise<{ templateId: string; subscriptionStatus: "accept" | "reject" | "ban" | "filter" }>(
      (resolve) => {
        wx.requestSubscribeMessage({
          tmplIds: [templateId],
          success: (result) => {
            const status = result[templateId] as "accept" | "reject" | "ban" | "filter" | undefined;

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
      },
    );
  } catch {
    return undefined;
  }
};
