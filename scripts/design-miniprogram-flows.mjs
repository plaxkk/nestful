import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),storage=new Map([['nestful.modelVersion',2]]),toasts=[];
global.wx={getStorageSync:k=>storage.get(k)??'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),navigateTo:()=>{},redirectTo:()=>{},reLaunch:()=>{},showToast:o=>toasts.push(o.title),pageScrollTo:()=>{},showLoading:()=>{},hideLoading:()=>{},getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}})};
const {api}=require('../apps/miniprogram/utils/api.js'),{session}=require('../apps/miniprogram/utils/session.js');
const a={id:'a',name:'家 A'},b={id:'b',name:'家 B'},me={id:'me',familyId:'a',role:'admin',displayName:'小禾'};
function reset(){session.clear();session.setUser({id:'user'});session.setToken('local-token','2030-01-01T00:00:00Z');session.setFamily(a);session.setMember(me);toasts.length=0;}
function page(name){let def;global.Page=d=>def=d;const path=require.resolve(`../apps/miniprogram/pages/${name}/index.js`);delete require.cache[path];require(path);const p={...def,data:structuredClone(def.data)};p.setData=(v,cb)=>{Object.assign(p.data,v);cb?.();};return p;}
reset();let p=page('ledger');assert.equal(p.data.formVisible,false);assert.equal(p.data.titleInput,'');assert.equal(p.data.amountInput,'');let saves=0;api.createLedgerEntry=async()=>{saves++;};await p.onCreateLedgerEntry();assert.equal(saves,0);p.onToggleGoalForm();assert.equal(p.data.goalFormVisible,true);p.onToggleForm();assert.equal(p.data.goalFormVisible,false);assert.equal(p.data.formVisible,true);console.log('PASS blank transaction cannot save; entry and goal editors are mutually exclusive');
reset();p=page('ledger');let resolveOld;api.listMembers=async()=>({data:[me]});api.listLedgerEntries=()=>new Promise(r=>resolveOld=r);api.getLedgerSummary=async()=>({data:{month:'2026-10',incomeCents:0,expenseCents:0,balanceCents:0,entryCount:0,categoryTotals:[],memberSplits:[],goalFunds:[]}});const old=p.loadLedgerData();session.setFamily(b);p.onHide();resolveOld({data:[{id:'old'}]});await old;assert.deepEqual(p.data.ledgerEntries,[]);console.log('PASS late ledger responses cannot reveal a previous family');
reset();p=page('reminders');let resolveReminders;api.listMembers=async()=>({data:[me]});api.listReminders=()=>new Promise(r=>resolveReminders=r);const load=p.loadPage();session.setFamily(b);p.onHide();resolveReminders({data:[{id:'old'}]});await load;assert.deepEqual(p.data.reminders,[]);p.onDueDateChange({detail:{value:'2027-02-03'}});p.onDueTimeChange({detail:{value:'19:45'}});assert.equal(p.data.dueAtInput,'2027-02-03 19:45');console.log('PASS reminder dates stay synchronized and late responses are discarded');
reset();p=page('digital-space');let recordSaves=0;api.createDigitalSpaceItem=async()=>{recordSaves++;};p.setData({titleInput:'资料',urlInput:'javascript:alert(1)'});await p.onCreateItem();assert.equal(recordSaves,0);p.setData({kindIndex:2,urlInput:'',occurredAtInput:'bad-date'});await p.onCreateItem();assert.equal(recordSaves,0);assert.equal(p.data.busy,false);assert.equal(p.data.formVisible,false);console.log('PASS record form rejects invalid links and dates before saving');
reset();p=page('digital-space');let finish;api.createDigitalSpaceItem=()=>{recordSaves++;return new Promise(r=>finish=r);};p.loadItems=async()=>{};p.setData({kindIndex:0,titleInput:'资料',urlInput:'https://example.com'});const saving=p.onCreateItem();await p.onCreateItem();assert.equal(recordSaves,1);finish({data:{}});await saving;assert.equal(p.data.formVisible,false);assert.equal(p.data.titleInput,'');assert.equal(p.data.busy,false);console.log('PASS repeated record saves create one item and reset the editor');
reset();p=page('digital-space');let recordLoads=0;api.listMembers=async()=>({data:[me]});api.listDigitalSpaceItems=async()=>{recordLoads++;return {data:[]};};await p.loadPage();await p.loadPage();assert.equal(recordLoads,1);session.markHomeChanged();await p.loadPage();assert.equal(recordLoads,2);console.log('PASS returning from an activity write refreshes the cached family records');
reset();p=page('join');let finishInvite;api.getInvitation=()=>new Promise(r=>finishInvite=r);p.onCodeInput({detail:{value:'old'}});const checking=p.loadInvitation('old');p.onCodeInput({detail:{value:'new'}});finishInvite({data:{familyName:'旧家庭',status:'active'}});await checking;assert.equal(p.data.familyName,'');assert.equal(p.data.valid,false);console.log('PASS changing an invite discards the previous validation response');
reset();p=page('family');assert.equal(p.data.inviteFormVisible,false);assert.equal(p.data.settingsVisible,false);p.onToggleSettings();assert.equal(p.data.settingsVisible,true);p.onToggleInvite();assert.equal(p.data.inviteFormVisible,true);console.log('PASS family settings and invitations open deliberately');
reset();let copied='';wx.setClipboardData=o=>{copied=o.data;o.success?.();};p=page('family');p.setData({inviteCode:'local-invite-code'});p.onCopyInviteCode();assert.equal(copied,'local-invite-code');p=page('digital-space');p.onCopyLink({currentTarget:{dataset:{url:'https://example.com/family'}}});assert.equal(copied,'https://example.com/family');p=page('help');p.onShow();p.onCopyReference();assert.match(copied,/用户：user/);assert.match(copied,/家庭：家 A/);console.log('PASS copy actions supply the invite, link and correct feedback context without touching the system clipboard');
// Public discovery must work without a session and never put private context in a card.
const savedWx=global.wx;global.wx=new Proxy({}, {get(){throw new Error('Public product page attempted to access a WeChat/session API');}});
p=page('about');p.onLoad?.({code:'not-an-invitation',familyId:'not-a-family'});p.onShow?.();
assert.equal(p.data.productName,'Nestful小窝');const publicCard=p.onShareAppMessage();assert.equal(publicCard.path,'/pages/about/index');assert.equal(p.onShareTimeline().query,'');
assert.equal(JSON.stringify(publicCard).includes('not-a-family'),false);assert.equal(JSON.stringify(publicCard).includes('not-an-invitation'),false);
global.wx=savedWx;console.log('PASS public product page opens and shares without login, storage or network APIs');
for(const name of ['home','reminders','digital-space','ledger']){
 reset();p=page(name);p.setData({familyName:'私密家庭名',currentFamilyId:'private-family',hero:{id:'private-activity',title:'私密活动'},reminders:[{id:'private-reminder',title:'私密用药'}],items:[{id:'private-record',title:'私密记录'}]});
 assert.equal(typeof p.onShareAppMessage,'function',`${name} must register a page share handler`);
 // Menu sharing must work independently of login, storage and network access.
 global.wx=new Proxy({}, {get(){throw new Error(`${name} share attempted to access a WeChat/session API`);}});
 try{
  const shared=p.onShareAppMessage({from:'menu'});
  assert.deepEqual(shared,publicCard);assert.equal(/private-|私密/.test(JSON.stringify(shared)),false);
 }finally{global.wx=savedWx;}
 console.log(`PASS ${name} registers menu sharing and returns only the public product card without session APIs`);
}
const tabPages={home:'home',reminders:'reminders',activities:'activities',records:'digital-space',family:'family'};
const navTemplate=readFileSync('apps/miniprogram/components/family-nav/index.wxml','utf8');
for(const [,tab] of navTemplate.matchAll(/data-page="([a-z-]+)"/g)){
 assert.ok(tabPages[tab],`Unknown tab destination ${tab}`);
 p=page(tabPages[tab]);assert.equal(typeof p.onShareAppMessage,'function',`${tab} tab must support menu sharing`);
}
reset();p=page('activities');
assert.equal(p.onShareAppMessage({from:'menu'}).path,'/pages/home/index');
p.setData({focused:true,activities:[{id:'selected-activity',title:'家庭聚餐'}],shareReadyId:'selected-activity',sharePath:'/pages/activities/index?activityId=selected-activity&code=prepared-invite',shareTitle:'已准备的活动卡片'});
assert.equal(p.onShareAppMessage({from:'menu'}).path,'/pages/activities/index?familyId=a&activityId=selected-activity');
assert.equal(p.onShareAppMessage({from:'button'}).path,p.data.sharePath);
reset();p=page('family');assert.equal(p.onShareAppMessage({from:'menu'}).path,'/pages/home/index');
p.setData({familyName:'家 A',joinPath:'/pages/join/index?code=prepared-family-invite'});
assert.equal(p.onShareAppMessage({from:'button'}).path,p.data.joinPath);
console.log('PASS all five tab destinations register sharing; activity menu/button and family invitations retain their destinations');
delete global.Page;delete global.wx;
