import type { Family, FamilyMember } from "./api";

const familyKey = "currentFamily";
const memberKey = "currentMember";
const tokenKey = "appSessionToken";
const tokenExpiresAtKey = "appSessionTokenExpiresAt";

export const session = {
  getFamily() {
    return wx.getStorageSync(familyKey) as Family | "";
  },

  setFamily(family: Family) {
    wx.setStorageSync(familyKey, family);
  },

  getMember() {
    return wx.getStorageSync(memberKey) as FamilyMember | "";
  },

  setMember(member: FamilyMember) {
    wx.setStorageSync(memberKey, member);
  },

  getToken() {
    return wx.getStorageSync(tokenKey) as string | "";
  },

  getTokenExpiresAt() {
    return wx.getStorageSync(tokenExpiresAtKey) as string | "";
  },

  setToken(token: string, expiresAt?: string) {
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
