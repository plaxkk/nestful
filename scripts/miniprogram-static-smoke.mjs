import { readFileSync } from "node:fs";

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
  "/pages/reminders/index",
  "/pages/ledger/index",
  "/pages/digital-space/index",
  "/pages/activities/index",
]);

expectIncludes("apps/miniprogram/pages/join/index.wxml", [
  "检查邀请码",
  "确认加入家庭",
  "bindtap=\"onJoinFamily\"",
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
  "splitMemberIds",
  "recurrence",
]);

expectIncludes("apps/miniprogram/pages/digital-space/index.ts", [
  "mediaItems",
  "taggedMemberIds",
  "filterItems",
]);

expectIncludes("apps/miniprogram/pages/activities/index.ts", [
  "api.updateActivityRsvp",
  "api.createActivityTask",
  "api.updateActivityStatus",
]);

console.log("miniprogram static smoke passed");
