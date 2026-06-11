const apiBaseUrlOverrideKey = "nestful.apiBaseUrl";

const defaultApiBaseUrls = {
  develop: "https://nestful.kkplayit.online",
  trial: "https://nestful.kkplayit.online",
  release: "https://nestful.kkplayit.online",
};

const environmentFor = (envVersion) => {
  if (envVersion === "develop") {
    return "local";
  }

  if (envVersion === "trial") {
    return "trial";
  }

  return "production";
};

const normalizeApiBaseUrl = (value) => value.trim().replace(/\/+$/, "");

const getEnvVersion = () => {
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

const getRuntimeConfig = () => {
  const envVersion = getEnvVersion();
  const override = getApiBaseUrlOverride();

  return {
    environment: environmentFor(envVersion),
    envVersion,
    apiBaseUrl: override ?? defaultApiBaseUrls[envVersion],
    apiBaseUrlOverridden: Boolean(override),
  };
};

const getApiBaseUrl = () => getRuntimeConfig().apiBaseUrl;

const setApiBaseUrlOverride = (apiBaseUrl) => {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);

  if (!normalized) {
    wx.removeStorageSync(apiBaseUrlOverrideKey);
    return;
  }

  wx.setStorageSync(apiBaseUrlOverrideKey, normalized);
};

const clearApiBaseUrlOverride = () => {
  wx.removeStorageSync(apiBaseUrlOverrideKey);
};

module.exports = {
  clearApiBaseUrlOverride,
  getApiBaseUrl,
  getRuntimeConfig,
  setApiBaseUrlOverride,
};
