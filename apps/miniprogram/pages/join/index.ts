import { api, errorMessage, type Family, type FamilyMember } from '../../utils/api';
import { session } from '../../utils/session';
import { getWechatIdentity } from '../../utils/wechat';

Page({
  data:{code:'',codeInput:'',displayName:'',invitationStatus:'正在检查邀请',familyName:'',pending:false,busy:false,requiresApproval:false,fromCard:false,agreed:false},
  targetActivityId:'',
  onLoad(query:Record<string,string|undefined>){
    this.targetActivityId=query.activityId??'';
    const code=query.code??'';
    this.setData({code,codeInput:code,fromCard:Boolean(code)});
    if(code)void this.loadInvitation(code);else this.setData({invitationStatus:'请填写管理员发来的邀请码'});
  },
  onCodeInput(e:WechatMiniprogram.Input){this.setData({codeInput:e.detail.value,code:e.detail.value.trim(),pending:false,invitationStatus:'请检查新邀请码'});},
  onDisplayNameInput(e:WechatMiniprogram.Input){this.setData({displayName:e.detail.value});},
  onAgreementChange(e:WechatMiniprogram.CheckboxGroupChange){this.setData({agreed:e.detail.value.includes('agree')});},
  onOpenHelp(){wx.navigateTo({url:'/pages/help/index'});},
  onCheckInvitation(){const code=this.data.codeInput.trim();if(code)void this.loadInvitation(code);},
  async loadInvitation(code:string){
    try{
      const r=(await api.getInvitation(code)).data;
      this.setData({familyName:r.familyName,requiresApproval:Boolean(r.requiresApproval),invitationStatus:r.status==='active'?`邀请你加入「${r.familyName}」`:r.status==='full'?'邀请人数已满，请联系管理员':'邀请已失效或已使用，请联系管理员'});
    }catch(error){this.setData({invitationStatus:errorMessage(error,'邀请暂不可用，请检查后重试')});}
  },
  async enterFamily(family:Family,member:FamilyMember){
    session.setFamily(family);session.setMember(member);session.setMembers(family.id,[member]);
    const url=this.targetActivityId?`/pages/activities/index?familyId=${family.id}&activityId=${encodeURIComponent(this.targetActivityId)}`:'/pages/home/index?current=1';
    wx.redirectTo({url});
  },
  async onRefreshStatus(){
    if(this.data.busy)return;this.setData({busy:true});
    try{
      await getWechatIdentity();const r=(await api.getJoinStatus(this.data.codeInput.trim())).data;
      if(r.status==='joined'&&r.family&&r.member){await this.enterFamily(r.family,r.member);return;}
      this.setData({pending:r.status==='pending',invitationStatus:r.status==='pending'?'申请已提交，等待管理员同意':r.status==='rejected'?'管理员未通过申请，请联系邀请人':r.status==='new'?'还没有提交申请':'邀请已失效，请联系管理员'});
    }catch(error){wx.showToast({title:errorMessage(error),icon:'none'});}
    finally{this.setData({busy:false});}
  },
  async onJoinFamily(){
    if(this.data.busy)return;
    const code=this.data.codeInput.trim(),displayName=this.data.displayName.trim();
    if(!code||!displayName){wx.showToast({title:'请填写邀请码和你的称呼',icon:'none'});return;}
    if(!this.data.agreed){wx.showToast({title:'请先阅读并同意隐私说明',icon:'none'});return;}
    this.setData({busy:true});
    try{
      const identity=await getWechatIdentity();
      const r=(await api.acceptInvitation(code,{displayName,userId:identity.userId})).data;
      if(r.status==='pending'){this.setData({pending:true,invitationStatus:'申请已提交，请让管理员在家庭首页同意'});return;}
      await this.enterFamily(r.family,r.member);
    }catch(error){wx.showToast({title:errorMessage(error,'加入暂未完成，请检查网络后重试'),icon:'none'});}
    finally{this.setData({busy:false});}
  }
});
