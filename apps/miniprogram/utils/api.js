const { getApiBaseUrl } = require("./config");
const { session } = require("./session");

const authHeaders = () => {
  const token = session.getToken();

  return token ? { authorization: `Bearer ${token}` } : {};
};

const request = (options) =>
  new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${getApiBaseUrl()}${options.url}`,
      timeout: 8000,
      header: {
        ...(options.data === undefined ? {} : { "content-type": "application/json" }),
        ...authHeaders(),
        ...(options.header || {}),
      },
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

  createWechatSession(body) {
    return request({
      method: "POST",
      url: "/v1/wechat/session",
      data: body,
    });
  },

  getFamily(familyId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}`,
    });
  },

  listMembers(familyId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/members`,
    });
  },

  getMember(familyId, memberId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/members/${memberId}`,
    });
  },

  updateMember(familyId, memberId, body) {
    return request({
      method: "PUT",
      url: `/v1/families/${familyId}/members/${memberId}`,
      data: body,
    });
  },

  removeMember(familyId, memberId) {
    return request({
      method: "DELETE",
      url: `/v1/families/${familyId}/members/${memberId}`,
    });
  },

  createInvitation(familyId, body) {
    return request({
      method: "POST",
      url: `/v1/families/${familyId}/invitations`,
      data: body,
    });
  },

  listInvitations(familyId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/invitations`,
    });
  },

  cancelInvitation(familyId, invitationId) {
    return request({
      method: "DELETE",
      url: `/v1/families/${familyId}/invitations/${invitationId}`,
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

  getReminderSubscriptionConfig(type) {
    return request({
      method: "GET",
      url: type ? `/v1/reminders/subscription-config/${type}` : "/v1/reminders/subscription-config",
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

  getLedgerSummary(familyId, month) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/ledger-summary${month ? `?month=${month}` : ""}`,
    });
  },

  listLedgerGoalFunds(familyId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/ledger-goal-funds`,
    });
  },

  createLedgerGoalFund(familyId, body) {
    return request({
      method: "POST",
      url: `/v1/families/${familyId}/ledger-goal-funds`,
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

  listActivities(familyId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/activities`,
    });
  },

  createActivity(familyId, body) {
    return request({
      method: "POST",
      url: `/v1/families/${familyId}/activities`,
      data: body,
    });
  },

  getActivity(familyId, activityId) {
    return request({
      method: "GET",
      url: `/v1/families/${familyId}/activities/${activityId}`,
    });
  },

  updateActivityRsvp(familyId, activityId, body) {
    return request({
      method: "POST",
      url: `/v1/families/${familyId}/activities/${activityId}/rsvp`,
      data: body,
    });
  },

  createActivityTask(familyId, activityId, body) {
    return request({
      method: "POST",
      url: `/v1/families/${familyId}/activities/${activityId}/tasks`,
      data: body,
    });
  },

  updateActivityTask(familyId, activityId, taskId, body) {
    return request({
      method: "PUT",
      url: `/v1/families/${familyId}/activities/${activityId}/tasks/${taskId}`,
      data: body,
    });
  },

  updateActivityStatus(familyId, activityId, body) {
    return request({
      method: "PUT",
      url: `/v1/families/${familyId}/activities/${activityId}/status`,
      data: body,
    });
  },
};

module.exports = {
  api,
};
