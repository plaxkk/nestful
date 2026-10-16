import { api } from "../../utils/api";
import { session } from "../../utils/session";
import { getWechatIdentity } from "../../utils/wechat";

Page({
  data: {
    familyNameInput: "我的家庭",busy:false,agreed:false
  },

  onFamilyNameInput(event: WechatMiniprogram.Input) {
    this.setData({
      familyNameInput: event.detail.value
    });
  },

  onBack() {
    wx.navigateBack();
  },
  onAgreementChange(e:WechatMiniprogram.CheckboxGroupChange){this.setData({agreed:e.detail.value.includes('agree')});},
  onOpenHelp(){wx.navigateTo({url:'/pages/help/index'});},

  async onCreateFamily() {
    if(this.data.busy)return;
    if(!this.data.agreed){wx.showToast({title:'请先阅读并同意隐私说明',icon:'none'});return;}
    const familyName = this.data.familyNameInput.trim();

    if (!familyName) {
      wx.showToast({
        title: "请先写家庭名字",
        icon: "none"
      });
      return;
    }

    this.setData({busy:true});
    wx.showLoading({ title: "创建中" });

    try {
      const identity = await getWechatIdentity();
      const user = session.getUser();
      const ownerDisplayName = user && user.nickname !== "微信用户" ? user.nickname : "家庭管理员";
      const response = await api.createFamily({
        name: familyName,
        ownerUserId: identity.userId,
        ownerWechatOpenId: identity.wechatOpenId,
        ownerDisplayName
      });

      session.setFamily(response.data.family);
      session.setMember(response.data.ownerMember);
      session.setMembers(response.data.family.id, [response.data.ownerMember]);

      wx.hideLoading();
      wx.reLaunch({ url: "/pages/home/index?current=1" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "创建失败，请稍后重试",
        icon: "none"
      });
    } finally{this.setData({busy:false});}
  }
});
