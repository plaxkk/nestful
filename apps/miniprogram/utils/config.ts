type MiniProgramEnvVersion = "develop" | "trial" | "release";

export type AppEnvironment = "local" | "trial" | "production";

export interface RuntimeConfig {
  environment: AppEnvironment;
  envVersion: MiniProgramEnvVersion;
  apiBaseUrl: string;
  apiBaseUrlOverridden: boolean;
}

const apiBaseUrlOverrideKey = "nestful.apiBaseUrl";

const defaultApiBaseUrls: Record<MiniProgramEnvVersion, string> = {
  develop: "http://127.0.0.1:3100",
  trial: "https://nestful.kkplayit.online",
  release: "https://nestful.kkplayit.online",
};

const environmentFor = (envVersion: MiniProgramEnvVersion): AppEnvironment => {
  if (envVersion === "develop") {
    return "local";
  }

  if (envVersion === "trial") {
    return "trial";
  }

  return "production";
};

const normalizeApiBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const getEnvVersion = (): MiniProgramEnvVersion => {
  try {
    const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;

    return envVersion === "develop" || envVersion === "trial" || envVersion === "release" ? envVersion : "release";
  } catch {
    return "release";
  }
};

const getApiBaseUrlOverride = () => {
  const value = wx.getStorageSync(apiBaseUrlOverrideKey);

  return typeof value === "string" && value.trim().length > 0 ? normalizeApiBaseUrl(value) : undefined;
};

export const getRuntimeConfig = (): RuntimeConfig => {
  const envVersion = getEnvVersion();
  const override = getApiBaseUrlOverride();

  return {
    environment: environmentFor(envVersion),
    envVersion,
    apiBaseUrl: override ?? defaultApiBaseUrls[envVersion],
    apiBaseUrlOverridden: Boolean(override),
  };
};

export const getApiBaseUrl = () => getRuntimeConfig().apiBaseUrl;

export const setApiBaseUrlOverride = (apiBaseUrl: string) => {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);

  if (!normalized) {
    wx.removeStorageSync(apiBaseUrlOverrideKey);
    return;
  }

  wx.setStorageSync(apiBaseUrlOverrideKey, normalized);
};

export const clearApiBaseUrlOverride = () => {
  wx.removeStorageSync(apiBaseUrlOverrideKey);
};
