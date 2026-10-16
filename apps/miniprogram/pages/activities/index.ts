import { api, errorMessage, type Activity, type FamilyMember, type RsvpStatus } from '../../utils/api';
import { session } from '../../utils/session';
import { getWechatIdentity } from '../../utils/wechat';

const pad=(n:number)=>String(n).padStart(2,'0');
const localTime=(value:string|Date)=>{const d=new Date(value);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;};
const defaultTime=()=>localTime(new Date(Date.now()+86400000)).slice(0,10)+' 18:00';
const statusText={draft:'草稿',scheduled:'已安排',completed:'已完成',cancelled:'已取消'};
const rsvpText={pending:'未回应',accepted:'确认参加',tentative:'待定',declined:'无法参加'};
const present=(a:Activity,members:FamilyMember[])=>{
  const me=session.getMember(),admin=Boolean(me&&me.role==='admin');
  const canManage=Boolean(me&&(admin||a.createdByMemberId===me.id));
  const open=a.status==='draft'||a.status==='scheduled';
  const name=(id?:string)=>members.find(m=>m.id===id)?.displayName??'家人';
  return {...a,startsAtText:localTime(a.startsAt),statusText:statusText[a.status],canManage,open,
    myRsvp:rsvpText[a.participants?.find(p=>me&&p.memberId===me.id)?.rsvp??'pending'],
    participantsText:a.participants?.map(p=>`${name(p.memberId)}：${rsvpText[p.rsvp]}`).join(' · ')||'等待家人回应',
    updatedText:a.version>1?'安排有更新，请确认当前时间和地点':'',
    tasks:(a.tasks??[]).map(t=>({...t,assigneeText:name(t.assigneeMemberId),canComplete:Boolean(open&&me&&(admin||t.assigneeMemberId===me.id||t.createdByMemberId===me.id))}))};
};

Page({
  data:{
    activities:[] as ReturnType<typeof present>[],members:[] as FamilyMember[],memberOptions:[] as string[],
    loading:false,busy:false,error:'',entryError:false,focused:false,isAdmin:false,
    formVisible:false,detailsVisible:false,editingId:'',editingVersion:0,
    titleInput:'',startsAtInput:defaultTime(),dateInput:defaultTime().slice(0,10),timeInput:'18:00',
    locationInput:'',descriptionInput:'',taskInput:'',taskAssigneeIndex:0,
    shareReadyId:'',shareTitle:'',sharePath:'',shareNotice:'',
    taskActivityId:'',newTaskTitle:'',newTaskAssigneeIndex:0,
  },
  targetActivityId:'',inviteCode:'',loadEpoch:0,
  onLoad(query:Record<string,string|undefined>){this.targetActivityId=query.activityId??'';this.inviteCode=query.code??'';this.setData({focused:Boolean(this.targetActivityId)});},
  onShow(){void this.loadPage();},
  onHide(){this.loadEpoch++;this.setData({loading:false});},
  async loadPage(){
    const epoch=++this.loadEpoch;
    this.setData({loading:true,error:'',entryError:false,shareReadyId:''});
    try{
      if(this.targetActivityId){
        this.setData({activities:[]});
        await getWechatIdentity();
        const entry=(await api.getActivityEntry(this.targetActivityId,this.inviteCode||undefined)).data;
        if(epoch!==this.loadEpoch)return;
        if(entry.access==='invitation'){
          wx.redirectTo({url:`/pages/join/index?code=${encodeURIComponent(this.inviteCode)}&activityId=${encodeURIComponent(this.targetActivityId)}`});return;
        }
        if(!entry.family||!entry.member)throw new Error('家庭加载失败');
        session.setFamily(entry.family);session.setMember(entry.member);
      }
      const family=session.getFamily();
      if(!family){wx.redirectTo({url:'/pages/home/index'});return;}
      const [memberResponse,response]=await Promise.all([api.listMembers(family.id),this.targetActivityId
        ?api.getActivity(family.id,this.targetActivityId).then(r=>({data:[r.data]})):api.listActivities(family.id)]);
      if(epoch!==this.loadEpoch)return;
      session.setMembers(family.id,memberResponse.data);
      const current=session.getMember(),fresh=memberResponse.data.find(m=>current&&m.id===current.id);
      if(fresh)session.setMember(fresh);
      const activities=response.data.map(a=>present(a,memberResponse.data));
      activities.sort((a,b)=>Number(!a.open)-Number(!b.open)||(a.open?Date.parse(a.startsAt)-Date.parse(b.startsAt):Date.parse(b.startsAt)-Date.parse(a.startsAt)));
      const member=session.getMember();
      this.setData({activities,members:memberResponse.data,memberOptions:memberResponse.data.map(m=>m.displayName),isAdmin:Boolean(member&&member.role==='admin'),loading:false});
    }catch(error){
      if(epoch!==this.loadEpoch)return;
      this.setData({activities:[],loading:false,error:errorMessage(error,'暂时加载不到活动，请检查网络后重试'),entryError:Boolean(this.targetActivityId)});
    }
  },
  onRetry(){void this.loadPage();},
  onJoinFromEntry(){wx.navigateTo({url:`/pages/join/index?activityId=${encodeURIComponent(this.targetActivityId)}`});},
  onAllActivities(){this.targetActivityId='';this.inviteCode='';this.setData({focused:false});void this.loadPage();},
  onGoFamily(){wx.reLaunch({url:'/pages/family/index'});},
  onOpenHelp(){wx.navigateTo({url:'/pages/help/index'});},
  onBeginCreate(){this.setData({formVisible:true,editingId:'',editingVersion:0,titleInput:'',locationInput:'',descriptionInput:'',taskInput:'',detailsVisible:false});},
  onCancelEdit(){this.setData({formVisible:false,editingId:'',editingVersion:0});},
  onToggleDetails(){this.setData({detailsVisible:!this.data.detailsVisible});},
  onTitleInput(e:WechatMiniprogram.Input){this.setData({titleInput:e.detail.value});},
  onLocationInput(e:WechatMiniprogram.Input){this.setData({locationInput:e.detail.value});},
  onDescriptionInput(e:WechatMiniprogram.Input){this.setData({descriptionInput:e.detail.value});},
  onTaskInput(e:WechatMiniprogram.Input){this.setData({taskInput:e.detail.value});},
  onTaskAssigneeChange(e:WechatMiniprogram.PickerChange){this.setData({taskAssigneeIndex:Number(e.detail.value)});},
  onDateChange(e:WechatMiniprogram.PickerChange){const date=String(e.detail.value);this.setData({dateInput:date,startsAtInput:`${date} ${this.data.timeInput}`});},
  onTimeChange(e:WechatMiniprogram.PickerChange){const time=String(e.detail.value);this.setData({timeInput:time,startsAtInput:`${this.data.dateInput} ${time}`});},
  onEditActivity(e:WechatMiniprogram.TouchEvent){
    const a=this.data.activities.find(a=>a.id===e.currentTarget.dataset.id);if(!a||!a.canManage||!a.open)return;
    const time=localTime(a.startsAt);
    this.setData({editingId:a.id,editingVersion:a.version,formVisible:true,detailsVisible:true,titleInput:a.title,startsAtInput:time,dateInput:time.slice(0,10),timeInput:time.slice(11),locationInput:a.location??'',descriptionInput:a.description??'',taskInput:''});
    wx.pageScrollTo({scrollTop:0,duration:200});
  },
  async mutate(action:()=>Promise<unknown>,success:string){
    if(this.data.busy)return false;this.setData({busy:true});
    try{await action();wx.showToast({title:success,icon:'none'});await this.loadPage();return true;}
    catch(error){wx.showToast({title:errorMessage(error),icon:'none'});return false;}
    finally{this.setData({busy:false});}
  },
  async onCreateActivity(){
    const family=session.getFamily(),member=session.getMember(),title=this.data.titleInput.trim();
    const starts=new Date(this.data.startsAtInput.replace(' ','T'));
    if(!family||!member||!title||Number.isNaN(starts.getTime())){wx.showToast({title:'请填写活动名称和时间',icon:'none'});return;}
    const body={title,startsAt:starts.toISOString(),location:this.data.locationInput.trim(),description:this.data.descriptionInput.trim()};
    const edited=Boolean(this.data.editingId);
    const saved=await this.mutate(()=>edited?api.updateActivity(family.id,this.data.editingId,{...body,version:this.data.editingVersion}):
      api.createActivity(family.id,{...body,createdByMemberId:member.id,participantMemberIds:this.data.members.map(m=>m.id),tasks:this.data.taskInput.trim()?[{title:this.data.taskInput.trim(),assigneeMemberId:this.data.members[this.data.taskAssigneeIndex]?.id??member.id}]:undefined}),edited?'安排已更新，请重新分享给家人':'活动已创建，可以发到家庭群');
    if(saved)this.setData({formVisible:false,editingId:'',editingVersion:0});
  },
  async onRsvpActivity(e:WechatMiniprogram.TouchEvent){
    const family=session.getFamily(),member=session.getMember();if(!family||!member)return;
    await this.mutate(()=>api.updateActivityRsvp(family.id,String(e.currentTarget.dataset.id),{actorMemberId:member.id,memberId:member.id,rsvp:e.currentTarget.dataset.rsvp as RsvpStatus}),'回应已保存');
  },
  async onUpdateTaskStatus(e:WechatMiniprogram.TouchEvent){
    const family=session.getFamily(),member=session.getMember(),a=this.data.activities.find(a=>a.id===e.currentTarget.dataset.id);
    const task=a?.tasks.find(t=>t.id===e.currentTarget.dataset.taskId);if(!family||!member||!a||!task)return;
    await this.mutate(()=>api.updateActivityTask(family.id,a.id,task.id,{actorMemberId:member.id,status:task.status==='done'?'open':'done',version:task.version}),'任务已更新');
  },
  async onUpdateActivityStatus(e:WechatMiniprogram.TouchEvent){
    const family=session.getFamily(),member=session.getMember(),a=this.data.activities.find(a=>a.id===e.currentTarget.dataset.id);if(!family||!member||!a)return;
    const status=e.currentTarget.dataset.status as 'completed'|'cancelled';
    const confirmed=await wx.showModal({title:status==='cancelled'?'取消这次活动？':'标记活动完成？',content:status==='cancelled'?'家人再次打开卡片会看到已取消。':'完成后仍可主动保存为家庭记忆。'});if(!confirmed.confirm)return;
    await this.mutate(()=>api.updateActivityStatus(family.id,a.id,{actorMemberId:member.id,status,version:a.version}),'活动状态已更新');
  },
  async onSaveActivityMemory(e:WechatMiniprogram.TouchEvent){const family=session.getFamily();if(family)await this.mutate(()=>api.saveActivityMemory(family.id,String(e.currentTarget.dataset.id)),'已保存为家庭记忆');},
  onAddTask(e:WechatMiniprogram.TouchEvent){this.setData({taskActivityId:String(e.currentTarget.dataset.id),newTaskTitle:'',newTaskAssigneeIndex:0});},
  onNewTaskTitle(e:WechatMiniprogram.Input){this.setData({newTaskTitle:e.detail.value});},
  onNewTaskAssignee(e:WechatMiniprogram.PickerChange){this.setData({newTaskAssigneeIndex:Number(e.detail.value)});},
  onCancelTask(){this.setData({taskActivityId:''});},
  async onSaveTask(){
    const family=session.getFamily(),member=session.getMember(),title=this.data.newTaskTitle.trim();if(!family||!member||this.data.busy)return;
    if(!title){wx.showToast({title:'请填写准备事项',icon:'none'});return;}
    const saved=await this.mutate(()=>api.createActivityTask(family.id,this.data.taskActivityId,{actorMemberId:member.id,title,assigneeMemberId:this.data.members[this.data.newTaskAssigneeIndex]?.id??member.id}),'准备事项已添加');
    if(saved)this.setData({taskActivityId:''});
  },
  async onPrepareShare(e:WechatMiniprogram.TouchEvent){
    const family=session.getFamily(),a=this.data.activities.find(a=>a.id===e.currentTarget.dataset.id);if(!family||!a||this.data.busy)return;
    this.setData({busy:true,shareReadyId:''});
    try{
      let path=`/pages/activities/index?familyId=${family.id}&activityId=${a.id}`;
      if(this.data.isAdmin){const invite=await api.createInvitation(family.id,{mode:'group',requiresApproval:true});path+=`&code=${encodeURIComponent(invite.data.invitation.code)}`;}
      this.setData({shareReadyId:a.id,shareTitle:`${a.title} · 请确认参加`,sharePath:path,shareNotice:this.data.isAdmin?'新家人可申请加入，需管理员同意；已有成员直接回应。':'此卡片供已有家庭成员打开；新家人请先向管理员申请邀请。'});
    }catch(error){wx.showToast({title:errorMessage(error,'邀请卡暂时生成失败，请重试'),icon:'none'});}
    finally{this.setData({busy:false});}
  },
  onCloseShare(){this.setData({shareReadyId:''});},
  onShareAppMessage(e:WechatMiniprogram.Page.IShareAppMessageOption){
    if(e.from==='button'&&this.data.shareReadyId)return {title:this.data.shareTitle,path:this.data.sharePath,imageUrl:'/assets/share-family.png'};
    const family=session.getFamily(),a=this.data.focused?this.data.activities[0]:undefined;
    return {title:a?`${a.title} · 请确认参加`:'家人的近期安排',path:a&&family?`/pages/activities/index?familyId=${family.id}&activityId=${a.id}`:'/pages/home/index',imageUrl:'/assets/share-family.png'};
  }
});
