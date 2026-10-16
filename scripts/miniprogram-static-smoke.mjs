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
  if(url.pathname.endsWith('/activities'))return o.success({statusCode:200,data:url.searchParams.has('cursor')?{data:[{id:'second'}]}:{data:[{id:'first'}],nextCursor:'next'}});
  throw new Error(`Unexpected request ${url.pathname}`);
 }
};
const {api}=require('../apps/miniprogram/utils/api.js');
const created=await api.createFamily({name:'test family',ownerUserId:'old-user',ownerWechatOpenId:'old-openid',ownerDisplayName:'owner'});
assert.equal(created.data.family.id,'created');assert.equal(familyCalls,2);
assert.equal(storage.get('currentUser').id,'real-user');
assert.deepEqual((await api.listActivities('family')).data.map(a=>a.id),['first','second']);
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
console.log('mini-program smoke passed: emitted JS, auth refresh, server-owned identity, pagination, login failure, template handlers');
