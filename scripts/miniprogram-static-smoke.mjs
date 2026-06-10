import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const read = (path) => readFileSync(path, "utf8");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const expectIncludes = (path, snippets) => {
  const content = read(path);

  for (const snippet of snippets) {
    assert(content.includes(snippet), `${path} missing ${snippet}`);
  }
};

const expectExcludes = (path, snippets) => {
  const content = read(path);

  for (const snippet of snippets) {
    assert(!content.includes(snippet), `${path} should not include ${snippet}`);
  }
};

expectIncludes("apps/miniprogram/pages/home/index.wxml", [
  "输入邀请码加入",
  "bindtap=\"onPrimaryAction\"",
  "bindtap=\"onJoinFamily\"",
  "{{primaryText}}",
]);

expectIncludes("apps/miniprogram/pages/home/index.ts", [
  "创建我的家庭",
  "打开我的家庭",
  "/pages/create-family/index",
  "/pages/join/index",
]);

expectIncludes("apps/miniprogram/pages/create-family/index.wxml", [
  "给家庭起个名字",
  "完成创建",
  "bindtap=\"onCreateFamily\"",
]);

expectIncludes("apps/miniprogram/pages/create-family/index.ts", [
  "session.setMembers",
]);

expectIncludes("apps/miniprogram/pages/family/index.wxml", [
  "生成家人邀请码",
  "微信发送邀请",
  "复制邀请码",
  "bindtap=\"onOpenFeature\"",
]);

expectIncludes("apps/miniprogram/pages/family/index.ts", [
  "生日和健康",
  "家庭账本",
  "记忆墙",
  "家庭活动",
  "openMemberEditor",
  "pageScrollTo",
  "memberSnapshotFor",
  "Promise.all([this.loadMembers(), this.loadInvitations()])",
  "/pages/reminders/index",
  "/pages/ledger/index",
  "/pages/digital-space/index",
  "/pages/activities/index",
]);

expectIncludes("apps/miniprogram/pages/family/index.js", [
  "openMemberEditor",
  "pageScrollTo",
  "memberSnapshotFor",
  "Promise.all([this.loadMembers(), this.loadInvitations()])",
]);

expectExcludes("apps/miniprogram/pages/family/index.ts", ["已打开基础资料"]);
expectExcludes("apps/miniprogram/pages/family/index.js", ["已打开基础资料"]);

expectIncludes("apps/miniprogram/app.wxss", [
  "align-items: center",
  "justify-content: center",
  "line-height: 1.2",
]);

expectIncludes("apps/miniprogram/pages/family/index.wxss", [
  ".small-danger-button",
  ".text-button",
  ".danger-action",
  "flex-wrap: wrap",
  "max-width: 420rpx",
  "box-sizing: border-box",
  "line-height: 1.2",
]);

expectIncludes("apps/miniprogram/pages/reminders/index.wxss", [
  ".complete-button",
  "line-height: 1.2",
]);

expectIncludes("apps/miniprogram/pages/activities/index.wxss", [
  ".secondary-action.compact",
  "line-height: 1.2",
]);

expectIncludes("apps/miniprogram/pages/join/index.wxml", [
  "检查邀请码",
  "确认加入家庭",
  "bindtap=\"onJoinFamily\"",
]);

expectIncludes("apps/miniprogram/pages/join/index.ts", [
  "session.setMembers",
]);

expectIncludes("apps/miniprogram/pages/reminders/index.wxml", [
  "保存提醒",
  "完成",
  "生日当天也推送",
  "onNotifyOnBirthdayChange",
]);

expectIncludes("apps/miniprogram/pages/reminders/index.ts", [
  "每天两次",
  "daily_twice",
  "notifyOnBirthday",
  "isAuthReminderError",
  "登录已失效，请重新进入家庭",
  "session.getMembers",
  "session.setMembers",
]);

expectIncludes("apps/miniprogram/pages/ledger/index.wxml", [
  "本月分类",
  "分摊",
  "续费提醒",
  "目标基金",
  "目标进度",
  "本月分摊",
  "保存这一笔",
  "保存目标",
]);

expectIncludes("apps/miniprogram/pages/digital-space/index.wxml", [
  "资料",
  "账号",
  "记忆",
  "发生日期",
  "地点",
  "人物",
  "媒体类型",
  "放入家庭空间",
]);

expectIncludes("apps/miniprogram/pages/activities/index.wxml", [
  "发起家庭活动",
  "协作任务",
  "复制说明",
  "完成活动",
  "取消活动",
]);

expectIncludes("apps/miniprogram/pages/ledger/index.ts", [
  "api.getLedgerSummary",
  "api.createLedgerGoalFund",
  "isAuthLedgerError",
  "登录已失效，请重新进入家庭",
  "session.getMembers",
  "session.setMembers",
  "splitMemberIds",
  "recurrence",
]);

expectIncludes("apps/miniprogram/utils/session.ts", [
  "familyMembers",
  "getMembers",
  "setMembers",
]);

const runApiAuthRetrySmoke = async () => {
  const require = createRequire(import.meta.url);
  const storage = new Map();
  const requests = [];

  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    getStorageSync: (key) => storage.get(key) ?? "",
    setStorageSync: (key, value) => {
      storage.set(key, value);
    },
    removeStorageSync: (key) => {
      storage.delete(key);
    },
    login: ({ success }) => {
      success({ code: "refresh-code" });
    },
    request: (options) => {
      requests.push(options);

      if (options.url.endsWith("/v1/wechat/session")) {
        options.success({
          statusCode: 200,
          data: {
            data: {
              userId: "user-1",
              token: "fresh-token",
              expiresAt: "2030-01-01T00:00:00.000Z",
              configured: false,
              user: {
                id: "user-1",
                nickname: "微信用户",
                createdAt: "2030-01-01T00:00:00.000Z",
              },
            },
          },
        });
        return;
      }

      const goalRequests = requests.filter((request) => request.url.endsWith("/ledger-goal-funds"));

      if (options.url.endsWith("/ledger-goal-funds") && goalRequests.length === 1) {
        options.success({ statusCode: 401, data: { error: "unauthorized" } });
        return;
      }

      if (options.url.endsWith("/ledger-goal-funds")) {
        assert(options.header.authorization === "Bearer fresh-token", "goal fund retry should use refreshed token");
        options.success({ statusCode: 201, data: { data: { id: "goal-1" } } });
        return;
      }

      throw new Error(`Unexpected request ${options.url}`);
    },
  };

  const { api } = require("../apps/miniprogram/utils/api.js");
  const response = await api.createLedgerGoalFund("family-1", {
    title: "家庭旅行基金",
    targetAmountCents: 100000,
    currentAmountCents: 0,
    createdByMemberId: "member-1",
  });

  assert(response.data.id === "goal-1", "goal fund request should retry after auth refresh");
  assert(storage.get("appSessionToken") === "fresh-token", "auth refresh should store the new app session token");
  assert(
    storage.get("appSessionTokenExpiresAt") === "2030-01-01T00:00:00.000Z",
    "auth refresh should store the app session expiry",
  );

  delete global.wx;
};

await runApiAuthRetrySmoke();

expectIncludes("apps/miniprogram/pages/digital-space/index.ts", [
  "mediaItems",
  "taggedMemberIds",
  "filterItems",
  "Promise.all([",
  "session.getMembers",
  "session.setMembers",
]);

expectIncludes("apps/miniprogram/pages/activities/index.ts", [
  "api.updateActivityRsvp",
  "api.createActivityTask",
  "api.updateActivityStatus",
  "Promise.all([",
  "session.getMembers",
  "session.setMembers",
]);

console.log("miniprogram static smoke passed");
