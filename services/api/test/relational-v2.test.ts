import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { identityStore } from "../src/repositories/identity.js";
import { familyRepository } from "../src/repositories/families.js";
import { closeDatabase, transaction, DomainError } from "../src/db.js";
import { activitiesRepository } from "../src/repositories/activities.js";
import { spaceRepository } from "../src/repositories/space.js";
import { remindersRepository } from "../src/repositories/reminders.js";
import { nextBirthday,nextOccurrence,localInstant } from "../src/reminder-schedule.js";
import { ledgerRepository } from "../src/repositories/ledger.js";
import Fastify from "fastify";
import { registerRoutes } from "../src/routes.js";

// Intentionally local-only: this runner creates and drops its own database.
const adminUrl = new URL(process.env.NESTFUL_TEST_ADMIN_URL ?? "postgresql://127.0.0.1:55432/postgres");
if (!["localhost","127.0.0.1"].includes(adminUrl.hostname)) throw new Error("Tests require a disposable local Postgres");
const database = `nestful_v2_test_${process.pid}_${Date.now()}`;
const admin = new Pool({connectionString:adminUrl.href});
let owner:Pool;
let a:Awaited<ReturnType<typeof identityStore.createSession>>;
let b:typeof a;
let outsider:typeof a;
let family:Awaited<ReturnType<typeof familyRepository.create>>;
let otherFamily:typeof family;
const migration=await readFile(new URL("../migrations/003_relational_v2_up.sql",import.meta.url),'utf8');
const precision=await readFile(new URL("../migrations/004_cursor_timestamp_precision_up.sql",import.meta.url),'utf8');
const membership=await readFile(new URL("../migrations/005_runtime_role_membership_up.sql",import.meta.url),'utf8');

before(async()=>{
  process.env.WECHAT_APP_ID='test-app';process.env.WECHAT_REMINDER_TEMPLATE_ID='test-template';
  await admin.query(`create database "${database}"`);
  const url=new URL(adminUrl);url.pathname=`/${database}`;process.env.DATABASE_URL=url.href;
  owner=new Pool({connectionString:url.href});
  await owner.query(migration);
  await owner.query(migration); // rerunning the initialization must not erase data
  await owner.query(precision);await owner.query(precision);
  await owner.query(membership);await owner.query(membership);
  a=await identityStore.createSession({appId:'test-app',openid:'a'});
  b=await identityStore.createSession({appId:'test-app',openid:'b'});
  outsider=await identityStore.createSession({appId:'test-app',openid:'outsider'});
  family=await familyRepository.create(a.userId,{name:'family A',ownerDisplayName:'A'});
  otherFamily=await familyRepository.create(outsider.userId,{name:'family B',ownerDisplayName:'B'});
});
after(async()=>{
  await closeDatabase();await owner?.end();
  await admin.query(`drop database if exists "${database}" with (force)`);await admin.end();
});

test('concurrent first WeChat logins yield one stable user and hashed sessions',async()=>{
  const sessions=await Promise.all(Array.from({length:6},()=>identityStore.createSession({appId:'test-app',openid:'same-user'})));
  assert.equal(new Set(sessions.map(s=>s.userId)).size,1);
  const rows=(await owner.query("select token_hash from nestful.user_sessions where user_id=$1",[sessions[0].userId])).rows;
  assert.equal(rows.length,6);assert.ok(rows.every(r=>!sessions.some(s=>s.token===r.token_hash)));
  assert.equal((await identityStore.getUserSession(sessions[0].token))?.user.id,sessions[0].userId);
  await identityStore.revokeSession(sessions[0].token);
  assert.equal(await identityStore.getUserSession(sessions[0].token),undefined);
});
test('only the private schema exists; runtime cannot create tables or edit audit',async()=>{
  const grant=(await owner.query(`select a.set_option,a.inherit_option from pg_auth_members a
    join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member
    where r.rolname='nestful_runtime' and m.rolname=current_user`)).rows[0];
  assert.deepEqual(grant,{set_option:true,inherit_option:false});
  assert.equal((await owner.query("select count(*)::int n from information_schema.tables where table_schema='nestful'")).rows[0].n,22);
  assert.equal((await owner.query("select to_regclass('public.nestful_app_state') t")).rows[0].t,null);
  await assert.rejects(transaction(tx=>tx.query("create table nestful.forbidden(id int)")),{code:'42501'});
  await assert.rejects(transaction(tx=>tx.query("delete from nestful.audit_events")),{code:'42501'});
});
test('family and private profile reads enforce membership and sensitive visibility',async()=>{
  await assert.rejects(familyRepository.members(family.family.id,outsider.userId),e=>e instanceof DomainError&&e.status===403);
  const invite=await familyRepository.invite(family.family.id,a.userId);
  const joined=await familyRepository.accept(invite.code,b.userId,'B');
  const updated=await familyRepository.updateMember(family.family.id,family.ownerMember.id,a.userId,{version:1,emergencyContact:'private'});
  assert.equal((await familyRepository.member(family.family.id,updated.id,a.userId)).emergencyContact,'private');
  assert.equal('emergencyContact' in (await familyRepository.member(family.family.id,updated.id,b.userId)),false);
  assert.ok((await familyRepository.members(family.family.id,b.userId)).every(m=>!('emergencyContact'in m)));
  assert.equal(joined.member.userId,b.userId);
});
test('invitation stores only hash and concurrent acceptance by different users cannot double-join',async()=>{
  const invite=await familyRepository.invite(otherFamily.family.id,outsider.userId);
  assert.equal((await owner.query("select code_hash from nestful.family_invitations where id=$1",[invite.id])).rows[0].code_hash===invite.code,false);
  const results=await Promise.allSettled([familyRepository.accept(invite.code,a.userId,'A'),familyRepository.accept(invite.code,b.userId,'B')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const winner=results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>;
  assert.ok(winner.value.member.id);
});
test('database refuses cross-family links and invalid ledger totals at commit',async()=>{
  await assert.rejects(transaction(tx=>tx.query(`insert into nestful.activities(family_id,title,starts_at,created_by_member_id)
    values($1,'invalid',now(),$2)`,[family.family.id,otherFamily.ownerMember.id])),{code:'23503'});
  await assert.rejects(transaction(tx=>tx.query(`insert into nestful.ledger_entries(family_id,type,category,title,amount_cents,paid_by_member_id,created_by_member_id,occurred_at)
    values($1,'expense','daily','invalid',101,$2,$2,now())`,[family.family.id,family.ownerMember.id])),{code:'23514'});
  await transaction(async tx=>{
    const row=(await tx.query(`insert into nestful.ledger_entries(family_id,type,category,title,amount_cents,paid_by_member_id,created_by_member_id,occurred_at)
      values($1,'expense','daily','valid',101,$2,$2,now()) returning id`,[family.family.id,family.ownerMember.id])).rows[0];
    await tx.query("insert into nestful.ledger_entry_splits(family_id,entry_id,member_id,amount_cents) values($1,$2,$3,101)",[family.family.id,row.id,family.ownerMember.id]);
  });
});
test('last admin cannot leave; two edits using same version cannot overwrite each other',async()=>{
  const f=await familyRepository.create(a.userId,{name:'version test',ownerDisplayName:'A'});
  await assert.rejects(familyRepository.updateMember(f.family.id,f.ownerMember.id,a.userId,{version:1,status:'inactive'}),{code:'23514'});
  const results=await Promise.allSettled(['one','two'].map(displayName=>familyRepository.updateMember(f.family.id,f.ownerMember.id,a.userId,{version:1,displayName})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.code,'version_conflict');
});
test('concurrent record creation never overwrites other families',async()=>{
  const list=await Promise.all(Array.from({length:8},(_,i)=>familyRepository.create(a.userId,{name:`concurrent ${i}`,ownerDisplayName:'A'})));
  const memberships=await familyRepository.memberships(a.userId);
  assert.ok(list.every(f=>memberships.some(m=>m.family.id===f.family.id)));
  assert.equal(new Set(list.map(f=>f.family.id)).size,8);
});
test('activities and digital space work independently; explicit memory save is idempotent and immutable',async()=>{
  const standalone=await spaceRepository.create(family.family.id,a.userId,{kind:'document',title:'Independent document',url:'https://example.com'});
  assert.equal(standalone.activityId,null);
  const activity=await activitiesRepository.create(family.family.id,a.userId,{title:'Original activity',startsAt:'2026-10-15T10:00:00Z',location:'Original place'});
  const completed=await activitiesRepository.status(family.family.id,activity.id,a.userId,'completed',activity.version);
  assert.equal(completed.status,'completed');
  assert.equal((await owner.query("select count(*)::int n from nestful.space_items where source_activity_id=$1",[activity.id])).rows[0].n,0);
  const saves=await Promise.all([spaceRepository.saveActivityMemory(family.family.id,activity.id,a.userId),spaceRepository.saveActivityMemory(family.family.id,activity.id,a.userId)]);
  assert.equal(saves[0].id,saves[1].id);
  await owner.query("update nestful.activities set title='Changed',location='Changed' where id=$1",[activity.id]);
  const memory=await spaceRepository.saveActivityMemory(family.family.id,activity.id,a.userId);
  assert.equal(memory.title,'Original activity');assert.equal(memory.place,'Original place');
  await assert.rejects(spaceRepository.saveActivityMemory(family.family.id,activity.id,outsider.userId),e=>e instanceof DomainError&&e.status===403);
  await assert.rejects(activitiesRepository.create(family.family.id,a.userId,{title:'Bad participant',startsAt:'2026-10-15T10:00:00Z',participantMemberIds:[otherFamily.ownerMember.id]}),e=>e instanceof DomainError&&e.code==='invalid_family_member');
});
test('stable cursor pagination visits each activity once',async()=>{
  const first=await activitiesRepository.list(family.family.id,a.userId,{limit:1});
  assert.equal(first.data.length,1);
  await assert.rejects(activitiesRepository.list(family.family.id,a.userId,{cursor:'bad-cursor'}),e=>e instanceof DomainError&&e.status===400);
  await assert.rejects(activitiesRepository.list(family.family.id,a.userId,{limit:101}),e=>e instanceof DomainError&&e.status===400);
});
test('calendar recurrence uses family local time, clamps months, and resolves actual lunar leap months',()=>{
  assert.equal(nextOccurrence('2026-01-31T00:00:00.000Z','monthly',{},'Asia/Shanghai','2026-01-31T00:00:00.000Z'),'2026-02-28T00:00:00.000Z');
  assert.equal(nextOccurrence('2026-02-28T00:00:00.000Z','monthly',{},'Asia/Shanghai','2026-01-31T00:00:00.000Z'),'2026-03-31T00:00:00.000Z');
  assert.equal(nextBirthday('2025-07-01T00:00:00.000Z',{birthdayDate:'0000-06-01',birthdayCalendar:'lunar',birthdayLeapMonth:true},'Asia/Shanghai'),'2025-07-25T00:00:00.000Z');
  assert.equal(nextBirthday('2026-01-01T00:00:00.000Z',{birthdayDate:'0000-01-01',birthdayCalendar:'lunar'},'Asia/Shanghai'),'2026-02-17T00:00:00.000Z');
  assert.throws(()=>localInstant({year:2026,month:3,day:8,hour:2,minute:30,second:0},'America/New_York'),/nonexistent_local_time/);
});
test('recurrence generation is independent of completion and concurrent generators do not duplicate',async()=>{
  const first=new Date(Date.now()+600000).toISOString();
  const r=await remindersRepository.create(family.family.id,a.userId,{type:'exercise',title:'Everyone exercise',dueAt:first,targetScope:'family',frequency:'daily_once',schedule:{timesOfDay:['08:00']}});
  assert.equal(r.participants.length,2);
  await remindersRepository.complete(family.family.id,r.id,a.userId);
  const own=(await remindersRepository.list(family.family.id,a.userId)).data.find(x=>x.id===r.id)!;
  assert.equal(own.occurrenceStatus,'completed');assert.equal(own.participants.find(p=>p.memberId!==family.ownerMember.id)?.status,'pending');
  const at=new Date(Date.now()+2*86400000);
  await Promise.all([remindersRepository.generate(at),remindersRepository.generate(at)]);
  const rows=(await owner.query("select scheduled_at,count(*)::int n from nestful.reminder_occurrences where plan_id=$1 group by scheduled_at",[r.planId])).rows;
  assert.ok(rows.length>=3);assert.ok(rows.every(x=>x.n===1));
  await assert.rejects(remindersRepository.complete(family.family.id,r.id,outsider.userId),e=>e instanceof DomainError&&e.status===403);
});
test('one subscription is not reused and concurrent workers cannot send a notification twice',async()=>{
  const due=new Date(Date.now()+60000),r=await remindersRepository.create(family.family.id,a.userId,{type:'medicine',title:'Own medication',dueAt:due.toISOString(),frequency:'daily_once',targetMemberIds:[family.ownerMember.id],schedule:{timesOfDay:['08:00']},notificationSubscription:{templateId:'test-template',recipientMemberId:family.ownerMember.id,subscriptionStatus:'accept'}});
  let sends=0;const send=async()=>{sends++;await new Promise(resolve=>setTimeout(resolve,15));return {ok:true};};
  await Promise.all([remindersRepository.dispatch(send,new Date(due.getTime()+1000)),remindersRepository.dispatch(send,new Date(due.getTime()+1000))]);
  assert.equal(sends,1);
  await remindersRepository.generate(new Date(Date.now()+2*86400000));
  const deliveries=(await owner.query(`select d.status from nestful.notification_deliveries d join nestful.reminder_occurrences o on o.id=d.occurrence_id where o.plan_id=$1 order by d.scheduled_at`,[r.planId])).rows;
  assert.equal(deliveries[0].status,'sent');assert.ok(deliveries.slice(1).every(d=>d.status==='skipped'));
});
test('ambiguous provider result becomes unknown rather than automatically retrying',async()=>{
  const due=new Date(Date.now()+60000);
  const r=await remindersRepository.create(family.family.id,a.userId,{type:'medicine',title:'Unknown delivery',dueAt:due.toISOString(),targetMemberIds:[family.ownerMember.id],notificationSubscription:{templateId:'test-template',recipientMemberId:family.ownerMember.id,subscriptionStatus:'accept'}});
  let attempts=0;const send=async()=>{attempts++;throw new Error('network interrupted');};
  await remindersRepository.dispatch(send,new Date(due.getTime()+1000));
  await remindersRepository.dispatch(send,new Date(due.getTime()+120000));
  const delivery=(await owner.query("select status,attempt_count from nestful.notification_deliveries where occurrence_id=$1",[r.id])).rows[0];
  assert.equal(delivery.status,'unknown');assert.equal(delivery.attempt_count,1);assert.equal(attempts,1);
});
test('ledger splitting is exact, income has no splits, and summaries respect Shanghai month boundaries',async()=>{
  const before=await ledgerRepository.summary(family.family.id,a.userId,'2026-10');
  const members=await familyRepository.members(family.family.id,a.userId),ids=members.map(m=>m.id);
  const expense=await ledgerRepository.createEntry(family.family.id,a.userId,{type:'expense',category:'daily',title:'101 cents',amountCents:101,paidByMemberId:family.ownerMember.id,splitMemberIds:ids,occurredAt:'2026-09-30T16:00:00.000Z'});
  assert.equal(expense.splits.reduce((n,s)=>n+s.amountCents,0),101);assert.deepEqual(expense.splits.map(s=>s.amountCents),[51,50]);
  const income=await ledgerRepository.createEntry(family.family.id,a.userId,{type:'income',category:'other',title:'Income',amountCents:300,paidByMemberId:family.ownerMember.id,splitMemberIds:ids,occurredAt:'2026-09-30T16:00:00.000Z'});
  assert.equal(income.splits.length,0);
  const summary=await ledgerRepository.summary(family.family.id,a.userId,'2026-10');
  assert.equal(summary.expenseCents-before.expenseCents,101);assert.equal(summary.incomeCents-before.incomeCents,300);assert.equal(summary.balanceCents-before.balanceCents,199);
  await assert.rejects(ledgerRepository.createEntry(family.family.id,a.userId,{type:'expense',category:'daily',title:'invalid',amountCents:1.2,paidByMemberId:family.ownerMember.id,occurredAt:new Date().toISOString()}),e=>e instanceof DomainError&&e.code==='invalid_amount');
  await assert.rejects(ledgerRepository.entries(family.family.id,outsider.userId),e=>e instanceof DomainError&&e.status===403);
});
test('API rejects anonymous and cross-family reads, derives actors, and exposes explicit memory saving',async()=>{
  const app=Fastify();await registerRoutes(app,{exchangeCode:async code=>({appId:'test-app',openid:code})});await app.ready();
  const auth={authorization:`Bearer ${a.token}`},foreign={authorization:`Bearer ${outsider.token}`};
  try{
    assert.equal((await app.inject({url:'/health'})).statusCode,200);
    assert.equal((await app.inject({url:'/v1/families'})).statusCode,404);
    for(const suffix of ['','/members','/reminders','/ledger-entries','/ledger-summary','/ledger-goal-funds','/activities','/digital-space-items','/audit-events']){
      const url=`/v1/families/${family.family.id}${suffix}`;
      assert.equal((await app.inject({url})).statusCode,401,url);
      assert.equal((await app.inject({url,headers:foreign})).statusCode,403,url);
    }
    const login=await app.inject({method:'POST',url:'/v1/wechat/session',payload:{code:'api-user'}});
    assert.equal(login.statusCode,200);assert.match(login.json().data.userId,/^[0-9a-f-]{36}$/);
    assert.equal((await app.inject({method:'POST',url:'/v1/families',headers:auth,payload:{name:'spoof',ownerDisplayName:'owner',ownerUserId:outsider.userId}})).statusCode,400);
    const created=await app.inject({method:'POST',url:'/v1/families',headers:auth,payload:{name:'API family',ownerDisplayName:'owner'}});
    assert.equal(created.statusCode,201);assert.equal(created.json().data.ownerMember.userId,a.userId);
    assert.equal((await app.inject({method:'POST',url:`/v1/families/${family.family.id}/members`,headers:auth,payload:{displayName:'offline'}})).statusCode,404);
    assert.equal((await app.inject({url:'/v1/reminders/dispatch-due'})).statusCode,503);
  }finally{await app.close();}
});
test('plan edits preserve the stable ID and history, cancel old future work, and enforce version conflicts',async()=>{
  const due=new Date(Date.now()+3600000).toISOString();
  const input={type:'exercise',title:'Original plan',dueAt:due,targetScope:'family',frequency:'daily_once',schedule:{timesOfDay:['08:00']}};
  const r=await remindersRepository.create(family.family.id,a.userId,input);
  const updated=await remindersRepository.updatePlan(family.family.id,r.planId,a.userId,{...input,title:'Revised plan',version:1});
  assert.equal(updated.id,r.planId);assert.equal(updated.version,2);
  assert.equal((await owner.query("select count(*)::int n from nestful.reminder_plans where id=$1",[r.planId])).rows[0].n,1);
  const occurrences=(await owner.query("select title,plan_revision,canceled_at from nestful.reminder_occurrences where plan_id=$1 order by plan_revision",[r.planId])).rows;
  assert.equal(occurrences.length,2);assert.ok(occurrences[0].canceled_at);assert.equal(occurrences[1].title,'Revised plan');
  await assert.rejects(remindersRepository.updatePlan(family.family.id,r.planId,a.userId,{...input,version:1}),e=>e instanceof DomainError&&e.status===409);
  await remindersRepository.updatePlan(family.family.id,r.planId,a.userId,{...input,version:2,enabled:false});
  assert.equal((await owner.query("select next_generation_at from nestful.reminder_plans where id=$1",[r.planId])).rows[0].next_generation_at,null);
});
test('known provider failures retry at most three times and overdue messages expire',async()=>{
  const due=new Date(Date.now()+60000);
  const input={type:'medicine',title:'Rejected delivery',dueAt:due.toISOString(),targetMemberIds:[family.ownerMember.id],notificationSubscription:{templateId:'test-template',recipientMemberId:family.ownerMember.id,subscriptionStatus:'accept'}};
  const r=await remindersRepository.create(family.family.id,a.userId,input);
  let attempts=0;const reject=async()=>{attempts++;return {ok:false,error:'provider_rejected'};};
  for(let i=0;i<4;i++)await remindersRepository.dispatch(reject,new Date(due.getTime()+i*120000));
  const d=(await owner.query("select status,attempt_count from nestful.notification_deliveries where occurrence_id=$1",[r.id])).rows[0];
  assert.equal(d.status,'failed');assert.equal(d.attempt_count,3);assert.equal(attempts,3);
  const expired=await remindersRepository.create(family.family.id,a.userId,{...input,title:'Expired delivery',dueAt:new Date(Date.now()-2*86400000).toISOString()});
  await remindersRepository.dispatch(async()=>{throw new Error('must not send expired');});
  assert.equal((await owner.query("select status from nestful.notification_deliveries where occurrence_id=$1",[expired.id])).rows[0].status,'expired');
});
test('deactivating a participant cancels pending deliveries but keeps historical records',async()=>{
  const f=await familyRepository.create(a.userId,{name:'exit test',ownerDisplayName:'A'});
  const invite=await familyRepository.invite(f.family.id,a.userId),joined=await familyRepository.accept(invite.code,b.userId,'B');
  const r=await remindersRepository.create(f.family.id,b.userId,{type:'medicine',title:'Before exit',dueAt:new Date(Date.now()+600000).toISOString(),targetMemberIds:[joined.member.id],notificationSubscription:{templateId:'test-template',recipientMemberId:joined.member.id,subscriptionStatus:'accept'}});
  await familyRepository.updateMember(f.family.id,joined.member.id,b.userId,{version:joined.member.version,status:'inactive'});
  assert.equal((await owner.query("select status from nestful.notification_deliveries where occurrence_id=$1",[r.id])).rows[0].status,'canceled');
  assert.equal((await owner.query("select count(*)::int n from nestful.reminder_occurrence_members where occurrence_id=$1",[r.id])).rows[0].n,1);
  await assert.rejects(familyRepository.members(f.family.id,b.userId),e=>e instanceof DomainError&&e.status===403);
});
test('cursor pagination never drops records sharing a millisecond boundary',async()=>{
  const ids=[];
  for(let i=0;i<4;i++)ids.push((await spaceRepository.create(family.family.id,a.userId,{kind:'document',title:`cursor ${i}`})).id);
  await owner.query("update nestful.space_items set created_at='2030-01-01T00:00:00.000123Z' where id=any($1::uuid[])",[ids]);
  const seen=new Set<string>();let cursor:string|undefined;
  do{
    const page=await spaceRepository.list(family.family.id,a.userId,{limit:1,cursor});
    for(const row of page.data){assert.equal(seen.has(row.id),false);seen.add(row.id);}cursor=page.nextCursor;
  }while(cursor);
  assert.ok(ids.every(id=>seen.has(id)));
});
