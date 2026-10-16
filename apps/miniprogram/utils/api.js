"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const config_1 = require("./config");
const session_1 = require("./session");
const authHeaders = () => {
    const token = session_1.session.getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
};
class ApiRequestError extends Error {
    constructor(statusCode, data) {
        super(`Request failed with status ${statusCode}`);
        this.statusCode = statusCode;
        this.data = data;
    }
}
const loginCode = () => new Promise((resolve) => {
    wx.login({
        success: (loginResult) => {
            resolve(loginResult.code || undefined);
        },
        fail: () => {
            resolve(undefined);
        },
    });
});
let sessionRefresh;
const wireBody = (options) => {
    if (!options.data || typeof options.data !== "object" || Array.isArray(options.data))
        return options.data;
    const data = { ...options.data };
    for (const key of ["ownerUserId", "ownerWechatOpenId", "userId", "wechatOpenId", "createdByMemberId", "actorMemberId"])
        delete data[key];
    if (options.url.endsWith("/rsvp"))
        delete data.memberId;
    return data;
};
const sendRequest = (options) => new Promise((resolve, reject) => {
    wx.request({
        ...options,
        url: `${(0, config_1.getApiBaseUrl)()}${options.url}`,
        data: wireBody(options),
        timeout: 8000,
        header: {
            ...(options.data === undefined ? {} : { "content-type": "application/json" }),
            ...authHeaders(),
            ...(options.header ?? {}),
        },
        success: (response) => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
                resolve(response.data);
                return;
            }
            reject(new ApiRequestError(response.statusCode, response.data));
        },
        fail: reject,
    });
});
const refreshAppSession = async () => {
    sessionRefresh ?? (sessionRefresh = (async () => {
        const code = await loginCode();
        if (!code) {
            return false;
        }
        try {
            const response = await sendRequest({
                method: "POST",
                url: "/v1/wechat/session",
                data: { code },
            });
            session_1.session.setToken(response.data.token, response.data.expiresAt);
            session_1.session.setUser(response.data.user);
            return true;
        }
        catch {
            return false;
        }
    })());
    try {
        return await sessionRefresh;
    }
    finally {
        sessionRefresh = undefined;
    }
};
const shouldRefreshSession = (options, error) => error instanceof ApiRequestError && error.statusCode === 401 && options.url !== "/v1/wechat/session";
const request = async (options) => {
    try {
        return await sendRequest(options);
    }
    catch (error) {
        if (shouldRefreshSession(options, error) && (await refreshAppSession())) {
            return sendRequest(options);
        }
        throw error;
    }
};
const listAll = async (url) => {
    const data = [], seen = new Set();
    let cursor;
    do {
        const response = await request({ method: "GET", url: `${url}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}` });
        data.push(...response.data);
        cursor = response.nextCursor;
        if (cursor && seen.has(cursor))
            throw new Error("Invalid pagination cursor");
        if (cursor)
            seen.add(cursor);
    } while (cursor);
    return { data };
};
exports.api = {
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
    listMyFamilies() {
        return request({
            method: "GET",
            url: "/v1/me/families",
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
    removeMember(familyId, memberId, version) {
        return request({
            method: "DELETE",
            url: `/v1/families/${familyId}/members/${memberId}`,
            data: { version },
        });
    },
    createInvitation(familyId, body) {
        return request({
            method: "POST",
            url: `/v1/families/${familyId}/invitations`,
            data: body,
        }).then(response => ({ data: { invitation: response.data, joinPath: response.data.joinPath ?? "" } }));
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
        return listAll(`/v1/families/${familyId}/reminders`);
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
        return listAll(`/v1/families/${familyId}/ledger-entries`);
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
        return listAll(`/v1/families/${familyId}/ledger-goal-funds`);
    },
    createLedgerGoalFund(familyId, body) {
        return request({
            method: "POST",
            url: `/v1/families/${familyId}/ledger-goal-funds`,
            data: body,
        });
    },
    listDigitalSpaceItems(familyId) {
        return listAll(`/v1/families/${familyId}/digital-space-items`);
    },
    createDigitalSpaceItem(familyId, body) {
        return request({
            method: "POST",
            url: `/v1/families/${familyId}/digital-space-items`,
            data: body,
        });
    },
    listActivities(familyId) {
        return listAll(`/v1/families/${familyId}/activities`);
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
    saveActivityMemory(familyId, activityId) {
        return request({ method: "POST", url: `/v1/families/${familyId}/activities/${activityId}/save-memory` });
    },
    subscribeReminder(familyId, reminderId, body) {
        return request({ method: "POST", url: `/v1/families/${familyId}/reminders/${reminderId}/subscription`, data: body });
    },
};
