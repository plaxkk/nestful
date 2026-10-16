import type { AppUser, Family, FamilyMember } from "./api";

const familyKey = "currentFamily";
const memberKey = "currentMember";
const membersKey = "familyMembers";
const tokenKey = "appSessionToken";
const tokenExpiresAtKey = "appSessionTokenExpiresAt";
const userKey = "currentUser";

type FamilyMembersCache = Record<string, FamilyMember[]>;

const ensureModelVersion = () => {
  if (wx.getStorageSync("nestful.modelVersion") === 2) return;
  for (const key of [familyKey, memberKey, membersKey, tokenKey, tokenExpiresAtKey, userKey]) wx.removeStorageSync(key);
  wx.setStorageSync("nestful.modelVersion", 2);
};

const readMembersCache = (): FamilyMembersCache => {
  const value = wx.getStorageSync(membersKey);

  return typeof value === "object" && value ? (value as FamilyMembersCache) : {};
};

export const session = {
  isFamily(id:string) { const family=this.getFamily();return Boolean(family&&family.id===id); },
  clearFamily() {
    wx.removeStorageSync(familyKey);
    wx.removeStorageSync(memberKey);
    wx.removeStorageSync(membersKey);
  },
  getFamily() {
    ensureModelVersion();
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

  getMembers(familyId: string) {
    const members = readMembersCache()[familyId];

    return Array.isArray(members) ? members : [];
  },

  setMembers(familyId: string, members: FamilyMember[]) {
    wx.setStorageSync(membersKey, {
      ...readMembersCache(),
      [familyId]: members
    });
  },

  getUser() {
    ensureModelVersion();
    return wx.getStorageSync(userKey) as AppUser | "";
  },

  setUser(user: AppUser) {
    wx.setStorageSync(userKey, user);
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
