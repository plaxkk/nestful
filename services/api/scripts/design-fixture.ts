// Disposable, loopback-only real API fixture for native mini-program design acceptance.
// Never points at the hosted database. The context contains test-only login tokens.
import { execFileSync } from 'node:child_process';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { Pool } from 'pg';
import Fastify from 'fastify';
import { identityStore } from '../src/repositories/identity.js';
import { familyRepository } from '../src/repositories/families.js';
import { activitiesRepository } from '../src/repositories/activities.js';
import { spaceRepository } from '../src/repositories/space.js';
import { ledgerRepository } from '../src/repositories/ledger.js';
import { remindersRepository } from '../src/repositories/reminders.js';
import { registerRoutes } from '../src/routes.js';
import { closeDatabase } from '../src/db.js';
const folder=mkdtempSync(join(tmpdir(),'nestful-design-')),data=join(folder,'data');
const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
const bin=(name:string)=>process.env.POSTGRES_BIN_DIR?join(process.env.POSTGRES_BIN_DIR,name):name;
let started=false,db:Pool|undefined;
const server=Fastify({logger:false});
async function cleanup(){await server.close();await closeDatabase();await db?.end();if(started){execFileSync(bin('pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});started=false;}rmSync(folder,{recursive:true,force:true});}
try{
 execFileSync(bin('initdb'),['-D',data,'-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
 execFileSync(bin('pg_ctl'),['-D',data,'-l',join(folder,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${folder}`,'-w','start'],{stdio:'pipe'});started=true;
 process.env.DATABASE_URL=`postgresql://127.0.0.1:${port}/postgres`;
 process.env.WECHAT_APP_ID='design-local-app';process.env.WECHAT_REMINDER_TEMPLATE_ID='design-local-template';
 db=new Pool({connectionString:process.env.DATABASE_URL});
 for(const name of ['003_relational_v2','004_cursor_timestamp_precision','005_runtime_role_membership','006_mvp_collaboration'])await db.query(readFileSync(new URL(`../migrations/${name}_up.sql`,import.meta.url),'utf8'));
 const owner=await identityStore.createSession({appId:'design-local-app',openid:'design-owner'});
 const guest=await identityStore.createSession({appId:'design-local-app',openid:'design-guest'});
 const first=await familyRepository.create(owner.userId,{name:'我们的家',ownerDisplayName:'小禾'});
 const second=await familyRepository.create(owner.userId,{name:'爸妈的家',ownerDisplayName:'小禾'});
 const invite=await familyRepository.invite(first.family.id,owner.userId,undefined,{mode:'group',requiresApproval:false});
 const joined=await familyRepository.accept(invite.code,guest.userId,'阿木');
 const activity=await activitiesRepository.create(first.family.id,owner.userId,{title:'周六一起吃晚饭',startsAt:new Date(Date.now()+86400000).toISOString(),location:'家里',description:'带上好心情，一起做顿家常饭。',participantMemberIds:[first.ownerMember.id,joined.member!.id],tasks:[{title:'准备水果',assigneeMemberId:first.ownerMember.id}]});
 await spaceRepository.create(first.family.id,owner.userId,{kind:'document',title:'家电保修资料',summary:'冰箱和洗衣机的保修单链接，维修时先看这里。',url:'https://example.com/warranty'});
 await spaceRepository.create(first.family.id,owner.userId,{kind:'memory',title:'第一次全家去露营',summary:'傍晚一起看到了很美的落日。',occurredAt:new Date().toISOString(),place:'湖边公园'});
 await ledgerRepository.createEntry(first.family.id,owner.userId,{type:'expense',category:'daily',title:'周末买菜',amountCents:12850,paidByMemberId:first.ownerMember.id,splitMemberIds:[first.ownerMember.id,joined.member!.id],occurredAt:new Date().toISOString()});
 await remindersRepository.create(first.family.id,owner.userId,{type:'exercise',title:'晚饭后一起散步',dueAt:new Date(Date.now()+3600000).toISOString(),frequency:'daily_once',targetScope:'family',schedule:{timesOfDay:['19:30']}});
 await registerRoutes(server,{exchangeCode:async()=>({appId:'design-local-app',openid:'design-owner'})});
 const url=await server.listen({port:0,host:'127.0.0.1'});
 const context={url,owner,guest,first,second,member:joined.member,activity,invite};
 const path=process.env.NESTFUL_UI_CONTEXT_FILE??'/private/tmp/nestful-design-context.json';
 writeFileSync(path,JSON.stringify(context),{mode:0o600});
 console.log(JSON.stringify({ready:true,url,contextFile:path,isolated:true}));
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void cleanup().then(()=>process.exit(0));});
}catch(error){await cleanup();throw error;}
