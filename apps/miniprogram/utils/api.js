const apiBaseUrl = "http://localhost:3100";

const request = (options) =>
  new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${apiBaseUrl}${options.url}`,
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }

        reject(new Error(`Request failed with status ${response.statusCode}`));
      },
      fail: reject,
    });
  });

const api = {
  createFamily(body) {
    return request({
      method: "POST",
      url: "/v1/families",
      data: body,
    });
  },

  listMembers(familyId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/members`,
    });
  },

  createInvitation(familyId, body) {
    return request({
      method: "POST",
      url: `/v1/families/${familyId}/invitations`,
      data: body,
    });
  },

  getInvitation(code) {
    return request({
      method: "GET",
      url: `/v1/invitations/${code}`,
    });
  },

  acceptInvitation(code, body) {
    return request({
      method: "POST",
      url: `/v1/invitations/${code}/accept`,
      data: body,
    });
  },
};

module.exports = {
  api,
};
