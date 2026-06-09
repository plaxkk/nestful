const familyKey = "currentFamily";
const memberKey = "currentMember";
const tokenKey = "appSessionToken";
const tokenExpiresAtKey = "appSessionTokenExpiresAt";

const session = {
  getFamily() {
    return wx.getStorageSync(familyKey);
  },

  setFamily(family) {
    wx.setStorageSync(familyKey, family);
  },

  getMember() {
    return wx.getStorageSync(memberKey);
  },

  setMember(member) {
    wx.setStorageSync(memberKey, member);
  },

  getToken() {
    return wx.getStorageSync(tokenKey);
  },

  getTokenExpiresAt() {
    return wx.getStorageSync(tokenExpiresAtKey);
  },

  setToken(token, expiresAt) {
    wx.setStorageSync(tokenKey, token);

    if (expiresAt) {
      wx.setStorageSync(tokenExpiresAtKey, expiresAt);
    } else {
      wx.removeStorageSync(tokenExpiresAtKey);
    }
  },

  clear() {
    wx.removeStorageSync(familyKey);
    wx.removeStorageSync(memberKey);
    wx.removeStorageSync(tokenKey);
    wx.removeStorageSync(tokenExpiresAtKey);
  },
};

module.exports = {
  session,
};
