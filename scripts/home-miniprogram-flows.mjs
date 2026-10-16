import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const storage = new Map([['nestful.modelVersion', 2]]), navigation = [], toasts = [];
let stack = [];
global.getCurrentPages = () => stack;
global.wx = {
  getStorageSync: k => storage.get(k) ?? '', setStorageSync: (k,v) => storage.set(k,v), removeStorageSync: k => storage.delete(k),
  navigateTo: o => navigation.push(['navigateTo',o.url]), redirectTo: o => navigation.push(['redirectTo',o.url]), reLaunch: o => navigation.push(['reLaunch',o.url]), navigateBack: o => navigation.push(['back',o.delta]),
  showToast: o => toasts.push(o.title), showActionSheet: async () => ({tapIndex: 0}), stopPullDownRefresh() {},
  getAccountInfoSync: () => ({miniProgram:{envVersion:'develop'}})
};
const { api, ApiRequestError } = require('../apps/miniprogram/utils/api.js');
const { session } = require('../apps/miniprogram/utils/session.js');
const { openFamilyPage } = require('../apps/miniprogram/utils/navigation.js');
const a = { id: 'family-a', name: '向阳一家' }, b = { id: 'family-b', name: '爸妈家' };
const ma = { id: 'member-a', userId: 'user', familyId: a.id, displayName: '我', role: 'admin' };
const mb = { ...ma, id: 'member-b', familyId: b.id };
const memberships = [{family:a,member:ma,members:[ma]}, {family:b,member:mb,members:[mb]}];
const at = '2027-10-17T10:30:00.000Z';
const dashboard = id => ({ activities: [{id:`activity-${id}`,title:`${id}家庭晚餐`,at}], tasks:[{id:`task-${id}`,activityId:`activity-${id}`,title:`${id}订餐`,at}], reminders:[{id:`reminder-${id}`,title:`${id}生日`,at}], upcoming:[{id:`activity-${id}`,title:`${id}家庭晚餐`,at}] });
const activity = id => ({ id:`activity-${id}`,familyId:id,title:`${id}家庭晚餐`,startsAt:at,status:'scheduled',location:'在家',participants:[{memberId:id===a.id?ma.id:mb.id,rsvp:'pending'}],tasks:[{id:`task-${id}`,version:9,status:'open'}] });
function page(name='home') { let definition; global.Page = d => definition = d; const path = require.resolve(`../apps/miniprogram/pages/${name}/index.js`); delete require.cache[path]; require(path); const p={...definition,data:structuredClone(definition.data)}; p.setData = (v,cb) => {Object.assign(p.data,v);cb?.();}; return p; }
const event = dataset => ({currentTarget:{dataset}});
const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function reset() {
  session.clear(); session.setUser({id:'user'}); session.setToken('token','2030-01-01T00:00:00Z');
  session.setFamily(a); session.setMember(ma); session.setMembers(a.id,[ma]); session.setPrimaryFamilyId(a.id);
  navigation.length=0;toasts.length=0;stack=[];
  api.listMyFamilies = async () => ({data:memberships}); api.getDashboard = async id => ({data:dashboard(id)}); api.getActivity = async id => ({data:activity(id)});
  api.listJoinRequests = async () => ({data:[]});
  api.getHome = async (preferred,fallback) => {
    const families=(await api.listMyFamilies()).data;
    const selected=families.find(m=>m.family.id===preferred)??families.find(m=>m.family.id===fallback)??families[0];
    if(!selected)return {data:{families,currentFamilyId:'',dashboard:null,activity:null,joinRequestCount:0}};
    const id=selected.family.id,d=(await api.getDashboard(id)).data;
    return {data:{families,currentFamilyId:id,dashboard:d,activity:(await api.getActivity(id)).data,joinRequestCount:selected.member.role==='admin'?(await api.listJoinRequests(id)).data.length:0}};
  };
  wx.showActionSheet = async () => ({tapIndex:0});
}
reset(); session.setFamily(b);session.setMember(mb);
let p=page();p.onLoad({});await p.restoreFamilySession();
assert.equal(session.getFamily().id,a.id);assert.equal(p.data.familyName,a.name);assert.equal(p.data.pendingCount,3);assert.equal(p.data.todos[0].activityId,`activity-${a.id}`);assert.equal(p.data.reminders[0].title,`${a.id}生日`);
console.log('PASS cold home enters the primary family and renders actual family-specific dashboard data');
await p.onSelectFamily(event({id:b.id}));assert.equal(p.data.familyName,b.name);assert.equal(session.getPrimaryFamilyId(),a.id);
let fresh=page();fresh.onLoad({});await fresh.restoreFamilySession();assert.equal(fresh.data.currentFamilyId,a.id);
p.onSetPrimary(event({id:b.id}));fresh=page();fresh.onLoad({});await fresh.restoreFamilySession();assert.equal(fresh.data.currentFamilyId,b.id);
console.log('PASS temporary switching preserves the primary family; explicit primary selection survives reopening');

reset();session.setPrimaryFamilyId('removed-family');api.listMyFamilies=async()=>({data:[memberships[1]]});p=page();await p.restoreFamilySession();assert.equal(p.data.currentFamilyId,b.id);assert.equal(session.getPrimaryFamilyId(),b.id);
api.listMyFamilies=async()=>({data:[]});await p.restoreFamilySession(true);assert.equal(p.data.hasFamily,false);assert.equal(p.data.hero,null);assert.deepEqual(p.data.todos,[]);assert.equal(session.getFamily(),'');
console.log('PASS removed primary families fall back to valid memberships; empty memberships clear protected content');

reset();p=page();p.syncHomeState();p.data.families=memberships.map(m=>({...m,id:m.family.id}));
const slow=deferred();api.getDashboard=async id=>id===a.id?slow.promise:{data:dashboard(b.id)};
const oldRead=p.loadDashboard();await p.onSelectFamily(event({id:b.id}));slow.resolve({data:dashboard(a.id)});await oldRead;assert.equal(p.data.hero.id,`activity-${b.id}`);assert.equal(p.data.todos[0].title,`${b.id}订餐`);
console.log('PASS slow responses from the previous family cannot overwrite the newly selected family');

reset();p=page();p.syncHomeState();const older=deferred();let reads=0;api.getDashboard=()=>++reads===1?older.promise:Promise.resolve({data:{...dashboard(a.id),tasks:[]}});
const first=p.loadDashboard();await p.loadDashboard();older.resolve({data:dashboard(a.id)});await first;assert.equal(p.data.todos.length,0);
console.log('PASS an older dashboard refresh cannot resurrect already refreshed tasks');

reset();p=page();p.syncHomeState();await p.loadDashboard();const choice=deferred();let responses=0;wx.showActionSheet=()=>choice.promise;
api.updateActivityRsvp=async(f,id,body)=>{responses++;assert.equal(f,a.id);assert.equal(id,`activity-${a.id}`);assert.equal(body.memberId,ma.id);assert.equal(body.rsvp,'accepted');return {data:activity(a.id)};};
const response=p.onHeroAction();await p.onHeroAction();choice.resolve({tapIndex:0});await response;assert.equal(responses,1);assert.equal(p.data.busy,false);
wx.showActionSheet=async()=>{throw {errMsg:'showActionSheet:fail cancel'};};const before=toasts.length;await p.onHeroAction();assert.equal(responses,1);assert.equal(toasts.length,before);
console.log('PASS homepage RSVP sends one deliberate response; double taps and canceled sheets do not mutate');

reset();p=page();p.syncHomeState();await p.loadDashboard();const waitingChoice=deferred();wx.showActionSheet=()=>waitingChoice.promise;
responses=0;api.updateActivityRsvp=async()=>{responses++;};const obsolete=p.onHeroAction();p.onHide();session.setFamily(b);session.setMember(mb);waitingChoice.resolve({tapIndex:0});await obsolete;assert.equal(responses,0);
console.log('PASS leaving or switching context while the response sheet is open prevents a stale mutation');

reset();p=page();p.syncHomeState();await p.loadDashboard();const finish=deferred();let completions=0;
api.updateActivityTask=async(f,id,task,body)=>{completions++;assert.equal(body.version,9);assert.equal(body.actorMemberId,ma.id);assert.equal(body.status,'done');return finish.promise;};
const completion=p.onCompleteTask(event({key:`task:task-${a.id}`}));await Promise.resolve();await p.onCompleteTask(event({key:`task:task-${a.id}`}));assert.equal(completions,1);
api.getDashboard=async()=>({data:{...dashboard(a.id),tasks:[]}});finish.resolve({data:activity(a.id)});await completion;assert.equal(p.data.todos.length,0);assert.equal(p.data.busyTaskId,'');
console.log('PASS task completion uses the current server version, prevents duplicate writes, and refreshes the count');

reset();p=page();p.syncHomeState();await p.loadDashboard();api.getDashboard=async()=>{throw new ApiRequestError(403,{error:'forbidden'});};await p.loadDashboard();assert.equal(p.data.hero,null);assert.equal(p.data.hasFamily,false);assert.deepEqual(p.data.families,[]);
console.log('PASS revoked dashboard access removes the previous family content and selector cache');

reset();p=page();p.syncHomeState();api.listJoinRequests=async()=>({data:[{id:'request'}]});await p.loadDashboard();await Promise.resolve();assert.equal(p.data.joinRequestCount,1);
session.setMember({...ma,role:'member'});p=page();p.syncHomeState();let requestReads=0;api.listJoinRequests=async()=>{requestReads++;return {data:[]};};await p.loadDashboard();assert.equal(requestReads,0);assert.equal(p.data.joinRequestCount,0);
console.log('PASS administrators see application badges without loading management; ordinary members do not request them');

reset();p=page('digital-space');p.currentFamilyId=a.id;p.data.members=[ma];p.data.items=[{title:'A private record'}];p.data.visibleItems=[{title:'A private record'}];p.data.lastLoadedAt=Date.now();
api.listMembers=async()=>({data:[mb]});const records=deferred();api.listDigitalSpaceItems=()=>records.promise;
session.setFamily(b);session.setMember(mb);p.onShow();assert.deepEqual(p.data.visibleItems,[]);records.resolve({data:[]});await new Promise(r=>setImmediate(r));assert.equal(p.currentFamilyId,b.id);assert.deepEqual(p.data.items,[]);
console.log('PASS reused record pages clear the old family immediately instead of reusing its 30-second cache');

reset();p=page('family');p.data.currentFamilyId=a.id;p.data.inviteCode='private-a';p.data.invitations=[{id:'old-a'}];p.data.joinRequests=[{id:'old-request'}];p.data.joinPath='private-path';
p.loadMembers=async()=>{};p.loadInvitations=async()=>{};p.loadJoinRequests=async()=>{};session.setFamily(b);session.setMember(mb);await p.loadFamilyData({force:true});assert.equal(p.data.inviteCode,'');assert.deepEqual(p.data.invitations,[]);assert.deepEqual(p.data.joinRequests,[]);assert.equal(p.data.joinPath,'');
console.log('PASS reused family management never carries old invitation codes or applications into another family');

reset();stack=[{route:'pages/home/index',options:{}},{route:'pages/activities/index',options:{activityId:'target'}},{route:'pages/family/index',options:{}}];openFamilyPage('home');assert.deepEqual(navigation.pop(),['back',2]);openFamilyPage('activities');assert.deepEqual(navigation.pop(),['navigateTo','/pages/activities/index']);
stack=Array.from({length:9},(_,i)=>({route:`unrelated/${i}`,options:{}}));openFamilyPage('records');assert.deepEqual(navigation.pop(),['redirectTo','/pages/digital-space/index']);
console.log('PASS navigation reuses list pages, preserves activity detail links, and respects the WeChat stack limit');

reset();session.setPrimaryFamilyId(a.id);session.setUser({id:'another-user'});assert.equal(session.getPrimaryFamilyId(),'');session.clear();assert.equal(storage.has('nestful.primaryFamily'),false);
console.log('PASS primary-family preferences are account-scoped and cleared by explicit logout');
delete global.Page;delete global.wx;delete global.getCurrentPages;
