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
const birthdayNameKey = envString(process.env.WECHAT_BIRTHDAY_NAME_KEY) ?? "thing1";
const birthdayDateKey = envString(process.env.WECHAT_BIRTHDAY_DATE_KEY) ?? "time2";
const exerciseProjectKey = envString(process.env.WECHAT_EXERCISE_PROJECT_KEY) ?? "thing1";
const exerciseTimeKey = envString(process.env.WECHAT_EXERCISE_TIME_KEY) ?? "thing2";
const exercisePlanKey = envString(process.env.WECHAT_EXERCISE_PLAN_KEY) ?? "thing4";
const exerciseFrequencyKey = envString(process.env.WECHAT_EXERCISE_FREQUENCY_KEY) ?? "thing5";
const exerciseAmountKey = envString(process.env.WECHAT_EXERCISE_AMOUNT_KEY) ?? "thing6";
const reminderTimeZone = envString(process.env.REMINDER_TIME_ZONE) ?? "Asia/Shanghai";

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

const reminderDateTimeFormatter = (() => {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: reminderTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };

  try {
    return new Intl.DateTimeFormat("en-CA", options);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      ...options,
      timeZone: "Asia/Shanghai",
    });
  }
})();

const reminderDateTimeParts = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const parts = Object.fromEntries(
    reminderDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === "24" ? "00" : parts.hour,
    minute: parts.minute,
  };
};

const formatReminderTime = (value: string) => {
  const parts = reminderDateTimeParts(value);

  if (!parts) {
    return value.slice(0, 20);
  }

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

const formatShortReminderTime = (value: string) => {
  const parts = reminderDateTimeParts(value);

  if (!parts) {
    return value.slice(0, 5);
  }

  return `${parts.hour}:${parts.minute}`;
};

const formatReminderDate = (value: string) => {
  const parts = reminderDateTimeParts(value);

  if (!parts) {
    return value.slice(0, 10);
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
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
  const templateData = (() => {
    if (input.reminder.type === "medicine") {
      return {
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
      };
    }

    if (input.reminder.type === "birthday") {
      return {
        [birthdayNameKey]: {
          value: (input.reminder.schedule?.targetLabel ?? input.reminder.title).slice(0, 20),
        },
        [birthdayDateKey]: {
          value: input.reminder.schedule?.birthdayDate ?? formatReminderDate(input.reminder.dueAt),
        },
      };
    }

    if (input.reminder.type === "exercise") {
      return {
        [exerciseProjectKey]: {
          value: input.reminder.title.slice(0, 20),
        },
        [exerciseTimeKey]: {
          value: formatShortReminderTime(input.reminder.dueAt),
        },
        [exercisePlanKey]: {
          value: (input.reminder.schedule?.targetLabel === "全家" ? "家庭运动计划" : "个人运动计划").slice(0, 20),
        },
        [exerciseFrequencyKey]: {
          value: (input.reminder.schedule?.frequencyLabel ?? "按计划").slice(0, 20),
        },
        [exerciseAmountKey]: {
          value: "按计划完成",
        },
      };
    }

    return {
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
  })();

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
