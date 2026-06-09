import { api } from "./api";
import type { ReminderType } from "./api";

export interface WechatIdentity {
  userId: string;
  wechatOpenId?: string;
}

export const getWechatIdentity = (): Promise<WechatIdentity> =>
  new Promise((resolve) => {
    wx.login({
      success: async (loginResult) => {
        if (!loginResult.code) {
          resolve({ userId: `local-${Date.now()}` });
          return;
        }

        try {
          const response = await api.createWechatSession({ code: loginResult.code });
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
