Page({
  data: {
    familyName: "我的家庭",
    todayItems: [
      "添加家庭成员",
      "创建第一个生日提醒",
      "发起一次家庭活动"
    ],
    modules: [
      "生日提醒",
      "家庭活动",
      "家庭会议",
      "记忆墙",
      "健康提醒",
      "家庭账本"
    ]
  },

  onCreateFamily() {
    wx.showToast({
      title: "家庭空间创建流程待接入",
      icon: "none"
    });
  }
});
