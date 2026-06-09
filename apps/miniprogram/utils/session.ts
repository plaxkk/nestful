import type { Family, FamilyMember } from "./api";

const familyKey = "currentFamily";
const memberKey = "currentMember";
const tokenKey = "appSessionToken";

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

  setToken(token: string) {
    wx.setStorageSync(tokenKey, token);
  },

  clear() {
    wx.removeStorageSync(familyKey);
    wx.removeStorageSync(memberKey);
    wx.removeStorageSync(tokenKey);
  },
};
