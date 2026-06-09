import type { Reminder } from "@nestful/shared";

const envString = (value: string | undefined) => {
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const appId = envString(process.env.WECHAT_APP_ID);
const appSecret = envString(process.env.WECHAT_APP_SECRET);
const reminderTemplateId = envString(process.env.WECHAT_REMINDER_TEMPLATE_ID);
const medicineTemplateId = envString(process.env.WECHAT_MEDICINE_TEMPLATE_ID) ?? reminderTemplateId;
const birthdayTemplateId = envString(process.env.WECHAT_BIRTHDAY_TEMPLATE_ID);
const exerciseTemplateId = envString(process.env.WECHAT_EXERCISE_TEMPLATE_ID);
const miniProgramState = envString(process.env.WECHAT_MINIPROGRAM_STATE) ?? "trial";
const medicineTimeKey = envString(process.env.WECHAT_MEDICINE_TIME_KEY) ?? "short_thing1";
const medicineNameKey = envString(process.env.WECHAT_MEDICINE_NAME_KEY) ?? "thing2";
const medicineUsageKey = envString(process.env.WECHAT_MEDICINE_USAGE_KEY) ?? "thing3";
const medicineDosageKey = envString(process.env.WECHAT_MEDICINE_DOSAGE_KEY) ?? "short_thing4";

interface WeChatErrorResponse {
  errcode?: number;
  errmsg?: string;
}

interface AccessTokenResponse extends WeChatErrorResponse {
  access_token?: string;
  expires_in?: number;
}

interface CodeSessionResponse extends WeChatErrorResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | undefined;

const templateForType = (type: Reminder["type"] | undefined) => {
  if (type === "medicine") {
    return medicineTemplateId;
  }

  if (type === "birthday") {
    return birthdayTemplateId;
  }

  if (type === "exercise") {
    return exerciseTemplateId;
  }

  return reminderTemplateId;
};

export const getReminderSubscriptionConfig = (type?: Reminder["type"]) => {
  const templateId = templateForType(type);

  return {
    enabled: Boolean(templateId && appId && appSecret),
    templateId,
  };
};

export const hasWeChatCredentials = () => Boolean(appId && appSecret);

const getAccessToken = async () => {
  if (!appId || !appSecret) {
    throw new Error("wechat_credentials_missing");
  }

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);

  const response = await fetch(url);
  const data = (await response.json()) as AccessTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(data.errmsg ?? `wechat_access_token_failed:${data.errcode ?? response.status}`);
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 7200) - 300, 60) * 1000,
  };

  return cachedAccessToken.token;
};

export const exchangeWechatCode = async (code: string) => {
  if (!appId || !appSecret) {
    return {
      userId: `local-${Date.now()}`,
      wechatOpenId: undefined,
      configured: false,
    };
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const response = await fetch(url);
  const data = (await response.json()) as CodeSessionResponse;

  if (!response.ok || !data.openid) {
    throw new Error(data.errmsg ?? `wechat_code_session_failed:${data.errcode ?? response.status}`);
  }

  return {
    userId: `wechat:${data.openid}`,
    wechatOpenId: data.openid,
    configured: true,
  };
};

const formatReminderTime = (value: string) => {
  const date = new Date(value);
  const pad = (item: number) => item.toString().padStart(2, "0");

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 20);
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
};

const formatShortReminderTime = (value: string) => {
  const date = new Date(value);
  const pad = (item: number) => item.toString().padStart(2, "0");

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 5);
  }

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const typeLabel = (type: Reminder["type"]) => {
  const labels: Record<Reminder["type"], string> = {
    birthday: "生日提醒",
    anniversary: "纪念日提醒",
    medicine: "吃药提醒",
    exercise: "运动提醒",
    bill: "账单提醒",
    activity: "活动提醒",
  };

  return labels[type] ?? "家庭提醒";
};

export const sendReminderSubscriptionMessage = async (input: {
  reminder: Reminder;
  recipientOpenId: string;
  templateId: string;
}) => {
  if (!hasWeChatCredentials()) {
    return {
      ok: false,
      skipped: true,
      error: "wechat_credentials_missing",
    };
  }

  const accessToken = await getAccessToken();
  const url = new URL("https://api.weixin.qq.com/cgi-bin/message/subscribe/send");
  url.searchParams.set("access_token", accessToken);
  const templateData =
    input.reminder.type === "medicine"
      ? {
          [medicineTimeKey]: {
            value: formatShortReminderTime(input.reminder.dueAt),
          },
          [medicineNameKey]: {
            value: input.reminder.title.slice(0, 20),
          },
          [medicineUsageKey]: {
            value: (input.reminder.schedule?.frequencyLabel ?? typeLabel(input.reminder.type)).slice(0, 20),
          },
          [medicineDosageKey]: {
            value: "按医嘱",
          },
        }
      : {
          thing1: {
            value: input.reminder.title.slice(0, 20),
          },
          time2: {
            value: formatReminderTime(input.reminder.dueAt),
          },
          thing3: {
            value: typeLabel(input.reminder.type).slice(0, 20),
          },
        };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      touser: input.recipientOpenId,
      template_id: input.templateId,
      page: "/pages/reminders/index",
      miniprogram_state: miniProgramState,
      lang: "zh_CN",
      data: templateData,
    }),
  });

  const responseData = (await response.json()) as WeChatErrorResponse;

  return {
    ok: response.ok && responseData.errcode === 0,
    error: responseData.errmsg ?? `wechat_subscribe_send_failed:${responseData.errcode ?? response.status}`,
  };
};
