const apiBaseUrl = "http://192.168.18.150:3100";

const request = (options) =>
  new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${apiBaseUrl}${options.url}`,
      timeout: 8000,
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

  listReminders(familyId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/reminders`,
    });
  },

  createReminder(familyId, body) {
    return request({
      method: "POST",
      url: `/v1/families/${familyId}/reminders`,
      data: body,
    });
  },

  completeReminder(reminderId, body) {
    return request({
      method: "POST",
      url: `/v1/reminders/${reminderId}/complete`,
      data: body,
    });
  },

  listLedgerEntries(familyId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/ledger-entries`,
    });
  },

  createLedgerEntry(familyId, body) {
    return request({
      method: "POST",
      url: `/v1/families/${familyId}/ledger-entries`,
      data: body,
    });
  },

  listDigitalSpaceItems(familyId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/digital-space-items`,
    });
  },

  createDigitalSpaceItem(familyId, body) {
    return request({
      method: "POST",
      url: `/v1/families/${familyId}/digital-space-items`,
      data: body,
    });
  },
};

module.exports = {
  api,
};
