import type { Reminder } from "@nestful/shared";

const envString = (value: string | undefined) => {
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const appId = envString(process.env.WECHAT_APP_ID);
const appSecret = envString(process.env.WECHAT_APP_SECRET);
const reminderTemplateId = envString(process.env.WECHAT_REMINDER_TEMPLATE_ID);
const miniProgramState = envString(process.env.WECHAT_MINIPROGRAM_STATE) ?? "trial";
const reminderTitleKey = envString(process.env.WECHAT_REMINDER_TITLE_KEY) ?? "thing1";
const reminderTimeKey = envString(process.env.WECHAT_REMINDER_TIME_KEY) ?? "time2";
const reminderTypeKey = envString(process.env.WECHAT_REMINDER_TYPE_KEY) ?? "thing3";

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

export const getReminderSubscriptionConfig = () => ({
  enabled: Boolean(reminderTemplateId && appId && appSecret),
  templateId: reminderTemplateId,
});

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
      data: {
        [reminderTitleKey]: {
          value: input.reminder.title.slice(0, 20),
        },
        [reminderTimeKey]: {
          value: formatReminderTime(input.reminder.dueAt),
        },
        [reminderTypeKey]: {
          value: typeLabel(input.reminder.type).slice(0, 20),
        },
      },
    }),
  });

  const data = (await response.json()) as WeChatErrorResponse;

  return {
    ok: response.ok && data.errcode === 0,
    error: data.errmsg ?? `wechat_subscribe_send_failed:${data.errcode ?? response.status}`,
  };
};
