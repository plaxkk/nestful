import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),storage=new Map([['nestful.modelVersion',2]]);
global.wx={getStorageSync:k=>storage.get(k)||'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}})};
const {session}=require('../apps/miniprogram/utils/session.js');
const {api}=require('../apps/miniprogram/utils/api.js');
const family={id:'a',name:'A'},member={id:'member-a',familyId:'a',userId:'user',role:'admin'};
session.setUser({id:'user'});session.setToken('valid','2030-01-01');session.setFamily(family);session.setMember(member);session.setPrimaryFamilyId('a');
let definition;global.Page=d=>definition=d;require('../apps/miniprogram/pages/home/index.js');
const p={...definition,data:structuredClone(definition.data)};p.setData=v=>Object.assign(p.data,v);
const item={id:'activity-a',title:'Dinner',at:'2027-10-17T10:30:00Z'};
const dashboard={activities:[item],tasks:[],reminders:[],upcoming:[item]};
let homeCalls=0,legacyCalls=0,finish;
api.getHome=async()=>{homeCalls++;return {data:{families:[{family,member,members:[member]}],currentFamilyId:'a',dashboard,activity:{...item,familyId:'a',startsAt:item.at,status:'scheduled',location:'at home',participants:[{memberId:member.id,rsvp:'pending'}]},joinRequestCount:2}};};
for(const method of ['listMyFamilies','getDashboard','getActivity','listJoinRequests'])api[method]=async()=>{legacyCalls++;throw Error('Separate startup request');};
p.onLoad({});p.syncHomeState();await p.restoreFamilySession();
assert.equal(homeCalls,1,'Cold Home must use one authenticated bootstrap request');
assert.equal(legacyCalls,0,'Cold Home must not chain separate family/dashboard/detail requests');
assert.equal(p.data.hero.location,'at home');assert.equal(p.data.joinRequestCount,2);
console.log('PASS cold Home renders family, dashboard, activity details and badge from one request');

await p.restoreFamilySession();assert.equal(homeCalls,1,'A clean immediate return must not refetch the same home');
console.log('PASS immediate clean returns reuse the visible page instead of refetching');

const original=api.getHome;api.getHome=()=>{homeCalls++;return new Promise(r=>finish=r);};
const refreshing=p.restoreFamilySession(true);await Promise.resolve();assert.equal(p.data.hero.title,'Dinner','Background refresh must retain visible content');
finish({data:{families:[{family,member,members:[member]}],currentFamilyId:'a',dashboard,activity:null,joinRequestCount:0}});await refreshing;
api.getHome=original;
session.markHomeChanged();await p.restoreFamilySession();assert.equal(homeCalls,3,'Successful mutations must invalidate the short reuse window');
console.log('PASS forced refresh retains the screen; a mutation invalidates clean-page reuse');

let staleSession=0;session.clear();session.setUser({id:'user'});session.setToken('valid','2030-01-01');
p.data.lastRestoredAt=Date.now();p.loadedRevision=session.getHomeRevision();p.syncHomeState();
api.getHome=async()=>{staleSession++;return {data:{families:[],currentFamilyId:'',dashboard:null,activity:null,joinRequestCount:0}};};
await p.restoreFamilySession();assert.equal(staleSession,1,'A cleared family/session cannot reuse old protected content');assert.equal(p.data.hero,null);
console.log('PASS cleared or changed family context cannot bypass the server through the reuse window');

const before=session.getHomeRevision();
wx.request=o=>o.success({statusCode:200,data:{data:{}}});
await api.updateActivityRsvp('a','activity-a',{actorMemberId:member.id,memberId:member.id,rsvp:'accepted'});
assert.equal(session.getHomeRevision(),before+1);
wx.request=o=>o.success({statusCode:500,data:{error:'test failure'}});
await assert.rejects(api.updateActivityRsvp('a','activity-a',{actorMemberId:member.id,memberId:member.id,rsvp:'accepted'}));
assert.equal(session.getHomeRevision(),before+1);
console.log('PASS actual successful writes invalidate Home, while failed writes do not report a change');
delete global.Page;delete global.wx;
