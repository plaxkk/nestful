const apiBaseUrl = "http://192.168.18.150:3100";

export interface ApiResponse<T> {
  data: T;
}

export interface Family {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  userId?: string;
  displayName: string;
  role: "admin" | "member" | "elder" | "child" | "guest";
  birthday?: string;
  birthdayCalendar?: "solar" | "lunar";
  location?: string;
  emergencyContact?: string;
  joinedAt?: string;
}

export interface FamilyInvitation {
  id: string;
  familyId: string;
  code: string;
  role: FamilyMember["role"];
  createdByMemberId: string;
  createdAt: string;
  expiresAt?: string;
  acceptedAt?: string;
  acceptedByMemberId?: string;
}

const request = <T>(options: WechatMiniprogram.RequestOption): Promise<T> =>
  new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${apiBaseUrl}${options.url}`,
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }

        reject(new Error(`Request failed with status ${response.statusCode}`));
      },
      fail: reject,
    });
  });

export const api = {
  createFamily(body: { name: string; ownerUserId: string; ownerDisplayName: string }) {
    return request<ApiResponse<{ family: Family; ownerMember: FamilyMember }>>({
      method: "POST",
      url: "/v1/families",
      data: body,
    });
  },

  listMembers(familyId: string) {
    return request<ApiResponse<FamilyMember[]>>({
      method: "GET",
      url: `/v1/families/${familyId}/members`,
    });
  },

  createInvitation(familyId: string, body: { createdByMemberId: string; role: FamilyMember["role"] }) {
    return request<ApiResponse<{ invitation: FamilyInvitation; joinPath: string }>>({
      method: "POST",
      url: `/v1/families/${familyId}/invitations`,
      data: body,
    });
  },

  getInvitation(code: string) {
    return request<ApiResponse<FamilyInvitation>>({
      method: "GET",
      url: `/v1/invitations/${code}`,
    });
  },

  acceptInvitation(code: string, body: { displayName: string; userId: string }) {
    return request<ApiResponse<{ invitation: FamilyInvitation; member: FamilyMember }>>({
      method: "POST",
      url: `/v1/invitations/${code}/accept`,
      data: body,
    });
  },
};
