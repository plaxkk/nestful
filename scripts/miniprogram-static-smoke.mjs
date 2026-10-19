import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
execFileSync(process.execPath,['scripts/build-miniprogram-js.mjs','--check'],{stdio:'inherit'});
const app=JSON.parse(readFileSync('apps/miniprogram/app.json','utf8'));
for(const page of app.pages){
  for(const ext of ['js','wxml','wxss','json'])assert.ok(existsSync(`apps/miniprogram/${page}.${ext}`),`${page}.${ext} missing`);
}
const storage=new Map([['nestful.modelVersion',2],['appSessionToken','stale-token'],['currentUser',{id:'old-user'}]]);
const requests=[];let familyCalls=0;
global.wx={
 getStorageSync:k=>storage.get(k)??'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),
 getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),login:o=>o.success({code:'fresh-code'}),
 request:o=>{
  requests.push(o);const url=new URL(o.url);
  if(url.pathname==='/v1/wechat/session')return o.success({statusCode:200,data:{data:{userId:'real-user',token:'fresh-token',expiresAt:'2030-01-01T00:00:00Z',user:{id:'real-user',nickname:'test'}}}});
  if(url.pathname==='/v1/families'){
   familyCalls++;if(familyCalls===1)return o.success({statusCode:401,data:{error:'unauthorized'}});
   assert.equal(o.header.authorization,'Bearer fresh-token');
   assert.equal(o.data.ownerUserId,undefined);assert.equal(o.data.ownerWechatOpenId,undefined);
   assert.equal(o.data.name,'test family');return o.success({statusCode:201,data:{data:{family:{id:'created'}}}});
  }
  if(url.pathname.endsWith('/save-memory')||url.pathname==='/v1/wechat/logout'||url.pathname.endsWith('/invitations/invite')){assert.deepEqual(o.data,{});assert.equal(o.header['content-type'],'application/json');return o.success({statusCode:200,data:{data:{ok:true}}});}
  if(url.pathname.endsWith('/reminder-plans/plan')&&o.method==='PUT'){assert.equal(o.data.assigneeMemberId,undefined);return o.success({statusCode:200,data:{data:{id:'plan'}}});}
  if(url.pathname.endsWith('/ledger-entries/entry')){assert.equal(o.data.recurrence,undefined);assert.equal(o.data.createdByMemberId,undefined);return o.success({statusCode:200,data:{data:{id:'entry'}}});}
  if(url.pathname.endsWith('/digital-space-items')&&o.method==='POST'){assert.equal(o.data.url,undefined);assert.equal(o.data.summary,undefined);assert.equal(o.data.place,undefined);return o.success({statusCode:201,data:{data:{id:'record'}}});}
  if(url.pathname.endsWith('/activities')&&o.method==='POST'){assert.equal(o.data.location,undefined);assert.equal(o.data.description,undefined);return o.success({statusCode:201,data:{data:{id:'activity'}}});}
  if(url.pathname.endsWith('/activities'))return o.success({statusCode:200,data:url.searchParams.has('cursor')?{data:[{id:'second'}]}:{data:[{id:'first'}],nextCursor:'next'}});
  throw new Error(`Unexpected request ${url.pathname}`);
 }
};
const {api}=require('../apps/miniprogram/utils/api.js');
const created=await api.createFamily({name:'test family',ownerUserId:'old-user',ownerWechatOpenId:'old-openid',ownerDisplayName:'owner'});
assert.equal(created.data.family.id,'created');assert.equal(familyCalls,2);
assert.equal(storage.get('currentUser').id,'real-user');
assert.deepEqual((await api.listActivities('family')).data.map(a=>a.id),['first','second']);
await api.saveActivityMemory('family','activity');
await api.logout();
await api.cancelInvitation('family','invite');
await api.updateReminderPlan('family','plan',{assigneeMemberId:null});
await api.createDigitalSpaceItem('family',{kind:'memory',title:'记忆',summary:'',url:'',place:''});
await api.createActivity('family',{title:'散步',startsAt:'2027-01-01T10:00:00Z',location:'',description:''});
await api.updateLedgerEntry('family','entry',{title:'买菜',recurrence:null,createdByMemberId:'old-actor'});
const {getWechatIdentity}=require('../apps/miniprogram/utils/wechat.js');
global.wx.login=o=>o.fail({errMsg:'login failed'});
await assert.rejects(getWechatIdentity({forceRefresh:true}),/微信登录失败/);
// Check real emitted page handlers against the templates, rather than source fragments.
for(const page of app.pages){
 let definition;global.Page=d=>{definition=d;};require(`../apps/miniprogram/${page}.js`);
 assert.ok(definition,`${page} did not register a Page`);
 const template=readFileSync(`apps/miniprogram/${page}.wxml`,'utf8');
 for(const [,handler] of template.matchAll(/(?:bind|catch)(?:tap|input|change|confirm)="([a-zA-Z][a-zA-Z0-9_]*)"/g))assert.equal(typeof definition[handler],'function',`${page}: missing handler ${handler}`);
}
delete global.Page;delete global.wx;
const components=new Set(Object.values(app.usingComponents??{}));
for(const page of app.pages)for(const component of Object.values(JSON.parse(readFileSync(`apps/miniprogram/${page}.json`,'utf8')).usingComponents??{}))components.add(component);
for(const component of components){
 let definition;global.Component=d=>{definition=d;};
 const path=`apps/miniprogram${component}`;
 for(const ext of ['js','wxml','wxss','json'])assert.ok(existsSync(`${path}.${ext}`),`${path}.${ext} missing`);
 require(`../${path}.js`);
 const template=readFileSync(`${path}.wxml`,'utf8');
 for(const [,handler] of template.matchAll(/(?:bind|catch)(?:tap|input|change|confirm)="([a-zA-Z][a-zA-Z0-9_]*)"/g))assert.equal(typeof definition.methods?.[handler],'function',`${component}: missing handler ${handler}`);
}
delete global.Component;
console.log('mini-program smoke passed: emitted JS, auth refresh, server-owned identity, pagination, login failure, template handlers');
