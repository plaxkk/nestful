const familyKey = "currentFamily";
const memberKey = "currentMember";
const tokenKey = "appSessionToken";

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

  setToken(token) {
    wx.setStorageSync(tokenKey, token);
  },

  clear() {
    wx.removeStorageSync(familyKey);
    wx.removeStorageSync(memberKey);
    wx.removeStorageSync(tokenKey);
  },
};

module.exports = {
  session,
};
