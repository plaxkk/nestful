import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
const storage=new Map([['nestful.modelVersion',2]]),navigation=[],toasts=[];
global.wx={getStorageSync:k=>storage.get(k)??'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),
  navigateTo:o=>navigation.push(o.url),redirectTo:o=>navigation.push(o.url),reLaunch:o=>navigation.push(o.url),
  showToast:o=>toasts.push(o.title),pageScrollTo:()=>{},showModal:async()=>({confirm:true}),
  showLoading:()=>{},hideLoading:()=>{},
  getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}})};
const {api,ApiRequestError}=require('../apps/miniprogram/utils/api.js');
const {session}=require('../apps/miniprogram/utils/session.js');
const familyA={id:'family-a',name:'A',version:1},familyB={id:'family-b',name:'B',version:1};
const memberA={id:'member-a',familyId:familyA.id,userId:'user',role:'admin',displayName:'A',version:1};
const memberB={...memberA,id:'member-b',familyId:familyB.id};
const activity=id=>({id,familyId:familyB.id,title:`Activity ${id}`,startsAt:'2027-01-01T10:00:00Z',status:'scheduled',createdByMemberId:memberB.id,version:1,participants:[],tasks:[]});
const reset=()=>{session.clear();session.setUser({id:'user'});session.setToken('token','2030-01-01T00:00:00Z');session.setFamily(familyA);session.setMember(memberA);navigation.length=0;toasts.length=0;};
function page(name){let definition;global.Page=d=>definition=d;const path=require.resolve(`../apps/miniprogram/pages/${name}/index.js`);delete require.cache[path];require(path);
  const p={...definition,data:structuredClone(definition.data)};p.setData=(values,cb)=>{Object.assign(p.data,values);cb?.();};return p;
}

reset();
const queried=[];
api.getActivityEntry=async()=>({data:{access:'member',familyId:familyB.id,family:familyB,member:memberB}});
api.listMembers=async id=>{queried.push(id);return {data:[memberB]};};
api.getActivity=async(id,a)=>{queried.push(id);return {data:activity(a)};};
let p=page('activities');p.onLoad({activityId:'target'});await p.loadPage();
assert.equal(session.getFamily().id,familyB.id);assert.deepEqual(queried,[familyB.id,familyB.id]);assert.equal(p.data.activities[0].id,'target');
console.log('PASS activity cards switch to the correct family and open the exact activity');

api.getActivityEntry=async()=>{throw new ApiRequestError(403,{error:'family_invitation_required'});};
await p.loadPage();assert.equal(p.data.activities.length,0);assert.equal(p.data.entryError,true);assert.ok(p.data.error);
console.log('PASS denied activity entry clears previous protected content');

reset();api.getActivityEntry=async()=>({data:{access:'invitation',familyId:familyB.id}});
p=page('activities');p.onLoad({activityId:'target',code:'invite-token'});await p.loadPage();
assert.match(navigation.at(-1),/pages\/join\/index\?code=invite-token&activityId=target/);
console.log('PASS login and join entry preserve the activity destination');

reset();session.setFamily(familyB);session.setMember(memberB);
p=page('activities');p.data.isAdmin=true;p.data.activities=[activity('first'),activity('chosen')];
let invitationOptions;
api.createInvitation=async(f,options)=>{invitationOptions=options;return {data:{invitation:{code:'group-code'}}};};
await p.onPrepareShare({currentTarget:{dataset:{id:'chosen'}}});
const card=p.onShareAppMessage({from:'button'});
assert.match(card.path,/activityId=chosen&code=group-code/);assert.match(card.title,/chosen/);assert.equal(invitationOptions.requiresApproval,true);
assert.ok(existsSync(`apps/miniprogram${card.imageUrl}`));
console.log('PASS each row shares its own activity with approval and a private-data-free image');

api.getInvitation=async()=>({data:{familyName:'B',status:'active',requiresApproval:true}});
reset();p=page('join');p.onLoad({code:'group-code',activityId:'target'});p.setData({displayName:'B',agreed:true});
api.acceptInvitation=async()=>({data:{status:'pending',requestId:'request',familyName:'B'}});
await p.onJoinFamily();assert.equal(p.data.pending,true);assert.equal(session.getFamily().id,familyA.id);assert.equal(navigation.length,0);
api.getJoinStatus=async()=>({data:{status:'joined',family:familyB,member:memberB}});
await p.onRefreshStatus();assert.equal(session.getFamily().id,familyB.id);assert.match(navigation.at(-1),/activityId=target/);
console.log('PASS pending applicants cannot enter; approval returns to the original activity');

reset();p=page('home');api.getHome=async()=>({data:{families:[],currentFamilyId:'',dashboard:null,activity:null,joinRequestCount:0}});await p.restoreFamilySession();
assert.equal(session.getFamily(),'');assert.equal(p.data.hasFamily,false);assert.equal(p.data.families.length,0);
console.log('PASS membership restoration removes archived/removed stale family state');

reset();p=page('family');api.getMember=async()=>({data:{...memberA,version:9}});
api.removeMember=async()=>{throw new ApiRequestError(409,{error:'last_admin_required'});};
await p.onLeaveFamily();assert.equal(session.getFamily().id,familyA.id);assert.match(toasts.at(-1),/管理员/);
api.removeMember=async()=>({data:{}});await p.onLeaveFamily();assert.equal(session.getFamily(),'');assert.equal(session.getToken(),'token');
console.log('PASS last admin gets actionable guidance; normal exit clears family caches only');

reset();p=page('family');p.setData({members:[memberA],todos:[{id:'old',title:'Private old item'}],inviteCode:'old-invite'});
api.listMembers=async()=>{throw new ApiRequestError(403,{error:'forbidden'});};
await p.loadMembers();assert.equal(session.getFamily(),'');assert.deepEqual(p.data.members,[]);assert.deepEqual(p.data.todos,[]);assert.equal(p.data.inviteCode,'');
console.log('PASS revoked family access clears cached content and invitations');

reset();p=page('ledger');p.setData({titleInput:'买菜',amountInput:'20'});p.loadLedgerData=async()=>{};
let creations=0,finishCreate;
api.createLedgerEntry=()=>{creations++;return new Promise(resolve=>finishCreate=resolve);};
const saving=p.onCreateLedgerEntry();await p.onCreateLedgerEntry();assert.equal(creations,1);assert.equal(p.data.busy,true);
finishCreate({data:{}});await saving;assert.equal(p.data.busy,false);
console.log('PASS repeated save taps create one ledger entry and release the save guard');

reset();let restored=0;p=page('home');p.restoreFamilySession=async()=>restored++;p.onLoad({loggedOut:'1'});p.onShow();assert.equal(restored,0);
console.log('PASS explicit logout does not silently log the user back in');
delete global.wx;delete global.Page;
