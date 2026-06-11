const familyKey = "currentFamily";
const memberKey = "currentMember";
const membersKey = "familyMembers";
const tokenKey = "appSessionToken";
const tokenExpiresAtKey = "appSessionTokenExpiresAt";
const userKey = "currentUser";
const readMembersCache = () => {
  const value = wx.getStorageSync(membersKey);

  return typeof value === "object" && value ? value : {};
};

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

  getMembers(familyId) {
    const members = readMembersCache()[familyId];

    return Array.isArray(members) ? members : [];
  },

  setMembers(familyId, members) {
    wx.setStorageSync(membersKey, {
      ...readMembersCache(),
      [familyId]: members,
    });
  },

  getUser() {
    return wx.getStorageSync(userKey);
  },

  setUser(user) {
    wx.setStorageSync(userKey, user);
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

  hasValidToken() {
    const token = this.getToken();
    const expiresAt = this.getTokenExpiresAt();

    if (!token) {
      return false;
    }

    return !expiresAt || Date.parse(expiresAt) > Date.now() + 60 * 1000;
  },

  clear() {
    wx.removeStorageSync(familyKey);
    wx.removeStorageSync(memberKey);
    wx.removeStorageSync(membersKey);
    wx.removeStorageSync(tokenKey);
    wx.removeStorageSync(tokenExpiresAtKey);
    wx.removeStorageSync(userKey);
  },
};

module.exports = {
  session,
};
