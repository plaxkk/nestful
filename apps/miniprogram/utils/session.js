const familyKey = "currentFamily";
const memberKey = "currentMember";

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

  clear() {
    wx.removeStorageSync(familyKey);
    wx.removeStorageSync(memberKey);
  },
};

module.exports = {
  session,
};
