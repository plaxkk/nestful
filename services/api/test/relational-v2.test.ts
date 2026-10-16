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
import { dashboardRepository } from '../src/repositories/dashboard.js';
import { homeRepository } from '../src/repositories/home.js';

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
const collaboration=await readFile(new URL("../migrations/006_mvp_collaboration_up.sql",import.meta.url),'utf8');

before(async()=>{
  process.env.WECHAT_APP_ID='test-app';process.env.WECHAT_REMINDER_TEMPLATE_ID='test-template';
  await admin.query(`create database "${database}"`);
  const url=new URL(adminUrl);url.pathname=`/${database}`;process.env.DATABASE_URL=url.href;
  owner=new Pool({connectionString:url.href});
  await owner.query(migration);
  await owner.query(migration); // rerunning the initialization must not erase data
  await owner.query(precision);await owner.query(precision);
  await owner.query(membership);await owner.query(membership);
  await owner.query(collaboration);await owner.query(collaboration);
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

test('group invitation admits several people once, caps concurrent admissions and remains revocable',async()=>{
  const f=await familyRepository.create(a.userId,{name:'Group limit',ownerDisplayName:'A'});
  const i=await familyRepository.invite(f.family.id,a.userId,undefined,{mode:'group',maxUses:2,requiresApproval:false});
  const users=await Promise.all(['g1','g2','g3'].map(openid=>identityStore.createSession({appId:'test-app',openid})));
  const joined=await Promise.allSettled(users.map(u=>familyRepository.accept(i.code,u.userId,'Family member')));
  assert.equal(joined.filter(r=>r.status==='fulfilled').length,2);
  const admitted=joined.findIndex(r=>r.status==='fulfilled');
  assert.equal((await familyRepository.accept(i.code,users[admitted].userId,'Again')).status,'joined');
  assert.equal((await familyRepository.invitations(f.family.id,a.userId))[0].useCount,2);
  assert.equal((await familyRepository.invitation(i.code)).status,'full');
  await familyRepository.cancelInvitation(f.family.id,i.id,a.userId);
  assert.equal((await familyRepository.invitation(i.code)).status,'canceled');
  const member=(await familyRepository.members(f.family.id,a.userId)).find(m=>m.userId===users[admitted].userId)!;
  await familyRepository.updateMember(f.family.id,member.id,a.userId,{version:member.version,status:'inactive'});
  await assert.rejects(familyRepository.accept(i.code,users[admitted].userId,'Again'),e=>e instanceof DomainError&&e.status===409);
});
test('group approvals are idempotent, require admin, honor expiry/revocation and cannot reactivate removed people',async()=>{
  const f=await familyRepository.create(a.userId,{name:'Approval',ownerDisplayName:'A'});
  const i=await familyRepository.invite(f.family.id,a.userId,undefined,{mode:'group'});
  assert.equal(i.requiresApproval,true);
  const r=await familyRepository.accept(i.code,b.userId,'B');assert.equal(r.status,'pending');
  const again=await familyRepository.accept(i.code,b.userId,'B');assert.equal(again.status,'pending');
  assert.equal((await familyRepository.joinRequests(f.family.id,a.userId)).length,1);
  await assert.rejects(familyRepository.members(f.family.id,b.userId),e=>e instanceof DomainError&&e.status===403);
  await assert.rejects(familyRepository.decideJoin(f.family.id,r.requestId!,b.userId,'approved'),e=>e instanceof DomainError&&e.status===403);
  const decisions=await Promise.allSettled([1,2].map(()=>familyRepository.decideJoin(f.family.id,r.requestId!,a.userId,'approved')));
  assert.equal(decisions.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await familyRepository.joinStatus(i.code,b.userId)).status,'joined');
  assert.equal((await familyRepository.invitations(f.family.id,a.userId))[0].useCount,1);
  const member=(await familyRepository.members(f.family.id,a.userId)).find(m=>m.userId===b.userId)!;
  await familyRepository.updateMember(f.family.id,member.id,a.userId,{version:member.version,status:'inactive'});
  await assert.rejects(familyRepository.accept(i.code,b.userId,'B again'),e=>e instanceof DomainError&&e.status===409);
  const pending=await familyRepository.accept(i.code,outsider.userId,'C');assert.equal(pending.status,'pending');
  await familyRepository.cancelInvitation(f.family.id,i.id,a.userId);
  await assert.rejects(familyRepository.decideJoin(f.family.id,pending.requestId!,a.userId,'approved'),e=>e instanceof DomainError&&e.status===409);
});
test('activity entry never leaks private details without membership or a valid matching invitation',async()=>{
  const f=await familyRepository.create(a.userId,{name:'Entry',ownerDisplayName:'A'});
  const activity=await activitiesRepository.create(f.family.id,a.userId,{title:'Private event',startsAt:new Date(Date.now()+86400000).toISOString(),description:'private detail'});
  await assert.rejects(activitiesRepository.entry(activity.id,b.userId),e=>e instanceof DomainError&&e.status===403);
  const wrong=await familyRepository.invite(otherFamily.family.id,outsider.userId);
  await assert.rejects(activitiesRepository.entry(activity.id,b.userId,wrong.code),e=>e instanceof DomainError&&e.status===403);
  const invite=await familyRepository.invite(f.family.id,a.userId,undefined,{mode:'group'});
  const preview=await activitiesRepository.entry(activity.id,b.userId,invite.code);
  assert.equal(preview.access,'invitation');assert.equal(preview.title,'Private event');
  assert.ok(!('description' in preview)&&!('members' in preview)&&!('participants' in preview));
  const own=await activitiesRepository.entry(activity.id,a.userId);
  assert.equal(own.family?.id,f.family.id);assert.equal(own.member?.id,f.ownerMember.id);
  await familyRepository.cancelInvitation(f.family.id,invite.id,a.userId);
  await assert.rejects(activitiesRepository.entry(activity.id,b.userId,invite.code),e=>e instanceof DomainError&&e.status===403);
});
test('activity changes require reconfirmation; dashboard only returns the current member work',async()=>{
  const f=await familyRepository.create(a.userId,{name:'Dashboard',ownerDisplayName:'A'});
  const invite=await familyRepository.invite(f.family.id,a.userId);
  const joined=await familyRepository.accept(invite.code,b.userId,'B');assert.ok(joined.member);
  const activity=await activitiesRepository.create(f.family.id,a.userId,{title:'Dinner',startsAt:new Date(Date.now()+86400000).toISOString(),participantMemberIds:[joined.member!.id],tasks:[{title:'Book table',assigneeMemberId:joined.member!.id}]});
  await activitiesRepository.rsvp(f.family.id,activity.id,b.userId,'accepted');
  assert.equal((await dashboardRepository.get(f.family.id,b.userId)).activities.length,0);
  assert.equal((await dashboardRepository.get(f.family.id,a.userId)).tasks.length,0);
  assert.equal((await dashboardRepository.get(f.family.id,b.userId)).tasks.length,1);
  await assert.rejects(activitiesRepository.update(f.family.id,activity.id,b.userId,{title:'Wrong',startsAt:activity.startsAt,version:activity.version}),e=>e instanceof DomainError&&e.status===403);
  const updated=await activitiesRepository.update(f.family.id,activity.id,a.userId,{title:'Dinner moved',startsAt:activity.startsAt,version:activity.version});
  assert.equal(updated.participants.find(p=>p.memberId===joined.member!.id)?.rsvp,'pending');
  assert.equal((await dashboardRepository.get(f.family.id,b.userId)).activities[0].id,activity.id);
  await assert.rejects(activitiesRepository.update(f.family.id,activity.id,a.userId,{title:'Stale',startsAt:activity.startsAt,version:1}),e=>e instanceof DomainError&&e.status===409);
  await assert.rejects(dashboardRepository.get(f.family.id,outsider.userId),e=>e instanceof DomainError&&e.status===403);
});
test('archive removes all access and stops recurrence, invitations and pending notifications',async()=>{
  const f=await familyRepository.create(a.userId,{name:'Archive',ownerDisplayName:'A'});
  const i=await familyRepository.invite(f.family.id,a.userId,undefined,{mode:'group',requiresApproval:false});
  await familyRepository.accept(i.code,b.userId,'B');
  const r=await remindersRepository.create(f.family.id,a.userId,{type:'medicine',title:'Pause on archive',dueAt:new Date(Date.now()+60000).toISOString(),frequency:'daily_once',targetMemberIds:[f.ownerMember.id],schedule:{timesOfDay:['08:00']},notificationSubscription:{templateId:'test-template',recipientMemberId:f.ownerMember.id,subscriptionStatus:'accept'}});
  await assert.rejects(familyRepository.archive(f.family.id,b.userId,1),e=>e instanceof DomainError&&e.status===403);
  await familyRepository.archive(f.family.id,a.userId,1);
  await assert.rejects(familyRepository.members(f.family.id,a.userId),e=>e instanceof DomainError&&e.status===403);
  await assert.rejects(familyRepository.accept(i.code,outsider.userId,'C'),e=>e instanceof DomainError&&e.status===409);
  assert.ok(!(await familyRepository.memberships(a.userId)).some(m=>m.family.id===f.family.id));
  assert.equal((await owner.query('select enabled,next_generation_at from nestful.reminder_plans where id=$1',[r.planId])).rows[0].enabled,false);
  assert.equal((await owner.query('select status from nestful.notification_deliveries where occurrence_id=$1',[r.id])).rows[0].status,'canceled');
});

test('expired group requests cannot be approved and cross-family request references fail in PostgreSQL',async()=>{
  const f=await familyRepository.create(a.userId,{name:'Expired request',ownerDisplayName:'A'});
  const i=await familyRepository.invite(f.family.id,a.userId,undefined,{mode:'group'});
  const request=await familyRepository.accept(i.code,b.userId,'B');
  await owner.query("update nestful.family_invitations set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1",[i.id]);
  await assert.rejects(familyRepository.decideJoin(f.family.id,request.requestId!,a.userId,'approved'),e=>e instanceof DomainError&&e.status===409);
  assert.equal((await familyRepository.joinStatus(i.code,b.userId)).status,'unavailable');
  await assert.rejects(owner.query('insert into nestful.family_join_requests(family_id,invitation_id,user_id,display_name) values($1,$2,$3,$4)',[otherFamily.family.id,i.id,outsider.userId,'Wrong family']),{code:'23503'});
});
test('pause preserves completed history, cancels pending work, and enforces creator/admin permissions',async()=>{
  const f=await familyRepository.create(a.userId,{name:'Pause',ownerDisplayName:'A'});
  const invite=await familyRepository.invite(f.family.id,a.userId);await familyRepository.accept(invite.code,b.userId,'B');
  const r=await remindersRepository.create(f.family.id,a.userId,{type:'exercise',title:'Exercise',dueAt:new Date(Date.now()+3600000).toISOString(),frequency:'daily_once',targetScope:'family',schedule:{timesOfDay:['08:00']}});
  await assert.rejects(remindersRepository.plan(f.family.id,r.planId,b.userId),e=>e instanceof DomainError&&e.status===403);
  await remindersRepository.complete(f.family.id,r.id,a.userId);
  const plan=await remindersRepository.plan(f.family.id,r.planId,a.userId);await remindersRepository.pause(f.family.id,r.planId,a.userId,plan.version);
  const result=(await remindersRepository.list(f.family.id,a.userId)).data.find(o=>o.id===r.id)!;
  assert.equal(result.completedAt!==undefined,true);assert.equal(result.enabled,false);
  await assert.rejects(remindersRepository.complete(f.family.id,r.id,b.userId),e=>e instanceof DomainError&&e.code==='reminder_canceled');
  await assert.rejects(remindersRepository.pause(f.family.id,r.planId,a.userId,plan.version),e=>e instanceof DomainError&&e.status===409);
});
test('new collaboration API endpoints reject anonymous/foreign actors and preserve pending admission',async()=>{
  const f=await familyRepository.create(a.userId,{name:'API collaboration',ownerDisplayName:'A'});
  const app=Fastify();await registerRoutes(app);await app.ready();
  const auth={authorization:`Bearer ${a.token}`},foreign={authorization:`Bearer ${outsider.token}`};
  try{
    for(const suffix of ['/dashboard','/join-requests']){
      assert.equal((await app.inject({url:`/v1/families/${f.family.id}${suffix}`})).statusCode,401);
      assert.equal((await app.inject({url:`/v1/families/${f.family.id}${suffix}`,headers:foreign})).statusCode,403);
    }
    assert.equal((await app.inject({method:'PUT',url:`/v1/families/${f.family.id}`,headers:foreign,payload:{name:'Hijack',version:1}})).statusCode,403);
    const renamed=await app.inject({method:'PUT',url:`/v1/families/${f.family.id}`,headers:auth,payload:{name:'Renamed',version:1}});
    assert.equal(renamed.statusCode,200);assert.equal(renamed.json().data.version,2);
    const invite=await app.inject({method:'POST',url:`/v1/families/${f.family.id}/invitations`,headers:auth,payload:{mode:'group'}});
    assert.equal(invite.statusCode,201);assert.equal(invite.json().data.requiresApproval,true);
    const accepted=await app.inject({method:'POST',url:`/v1/invitations/${invite.json().data.code}/accept`,headers:foreign,payload:{displayName:'Applicant'}});
    assert.equal(accepted.statusCode,200);assert.equal(accepted.json().data.status,'pending');assert.equal(accepted.json().data.member,undefined);
    const requests=(await app.inject({url:`/v1/families/${f.family.id}/join-requests`,headers:auth})).json().data;
    assert.equal(requests.length,1);assert.equal(requests[0].displayName,'Applicant');
    assert.equal((await app.inject({method:'POST',url:`/v1/families/${f.family.id}/join-requests/${requests[0].id}/decision`,headers:foreign,payload:{decision:'approved'}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:`/v1/families/${f.family.id}/join-requests/${requests[0].id}/decision`,headers:auth,payload:{decision:'approved'}})).statusCode,200);
    assert.equal((await app.inject({url:`/v1/families/${f.family.id}/dashboard`,headers:foreign})).statusCode,200);
  }finally{await app.close();}
});

test('Vercel entry preserves invitation queries and pagination cursors end to end',async()=>{
  const {default:handler}=await import('../../../api/index.js');
  const f=await familyRepository.create(a.userId,{name:'Vercel query',ownerDisplayName:'A'});
  const i=await familyRepository.invite(f.family.id,a.userId,undefined,{mode:'group'});
  const activity=await activitiesRepository.create(f.family.id,a.userId,{title:'Shared activity',startsAt:new Date().toISOString()});
  await activitiesRepository.create(f.family.id,a.userId,{title:'Second activity',startsAt:new Date(Date.now()+1000).toISOString()});
  const invoke=async(query:Record<string,string>,token:string)=>{
    let code=0,body:any;
    await handler({query,method:'GET',headers:{authorization:`Bearer ${token}`}},{setHeader(){},status(n:number){code=n;},send(s:string){body=JSON.parse(s);}});
    return {code,body};
  };
  const entry=await invoke({path:`/v1/activities/${activity.id}/entry`,code:i.code},b.token);
  assert.equal(entry.code,200);assert.equal(entry.body.data.access,'invitation');
  const first=await invoke({path:`/v1/families/${f.family.id}/activities`,limit:'1'},a.token);
  assert.equal(first.body.data.length,1);assert.ok(first.body.nextCursor);
  const second=await invoke({path:`/v1/families/${f.family.id}/activities`,limit:'1',cursor:first.body.nextCursor},a.token);
  assert.equal(second.code,200);assert.notEqual(second.body.data[0].id,first.body.data[0].id);
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
  assert.equal((await owner.query("select count(*)::int n from information_schema.tables where table_schema='nestful'")).rows[0].n,23);
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
test('family creation commits its first admin and audit together and rolls back failed references',async()=>{
  const created=await familyRepository.create(a.userId,{name:'Atomic family',ownerDisplayName:'A'});
  const event=(await owner.query("select actor_user_id,actor_member_id,resource_id from nestful.audit_events where family_id=$1 and action='family.created'",[created.family.id])).rows;
  assert.deepEqual(event,[{actor_user_id:a.userId,actor_member_id:created.ownerMember.id,resource_id:created.family.id}]);
  const counts=async()=>(await owner.query(`select (select count(*) from nestful.families) as families,
    (select count(*) from nestful.family_members) as members,(select count(*) from nestful.audit_events) as audits`)).rows[0];
  const before=await counts();
  await assert.rejects(familyRepository.create(randomUUID(),{name:'Must roll back',ownerDisplayName:'missing user'}),{code:'23503'});
  assert.deepEqual(await counts(),before);
});
test('batched membership reads keep family members and private fields isolated',async()=>{
  const list=await familyRepository.memberships(a.userId);
  assert.ok(list.length>2);
  for(const item of list){
    assert.equal(item.member.userId,a.userId);
    assert.equal(item.member.familyId,item.family.id);
    assert.ok(item.members.every(m=>m.familyId===item.family.id&&!('emergencyContact' in m)&&!('privateNotes' in m)));
    assert.ok(item.members.some(m=>m.id===item.member.id));
  }
  assert.ok(!list.some(item=>item.family.id===otherFamily.family.id&&item.members.every(m=>m.userId!==a.userId)));
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

test('home bootstrap authenticates once and returns one complete selected-family view',async()=>{
  const f=await familyRepository.create(a.userId,{name:'Startup family',ownerDisplayName:'A'});
  const activity=await activitiesRepository.create(f.family.id,a.userId,{title:'Startup dinner',startsAt:new Date(Date.now()+86400000).toISOString(),location:'Home'});
  const invite=await familyRepository.invite(f.family.id,a.userId,undefined,{mode:'group',requiresApproval:true});
  await familyRepository.accept(invite.code,b.userId,'Pending applicant');
  const app=Fastify();await registerRoutes(app);await app.ready();
  try{
    assert.equal((await app.inject({url:'/v1/me/home'})).statusCode,401);
    const response=await app.inject({url:`/v1/me/home?familyId=${f.family.id}`,headers:{authorization:`Bearer ${a.token}`}});
    assert.equal(response.statusCode,200);
    assert.equal(response.headers['cache-control'],'private, no-store');
    const result=response.json().data;
    assert.equal(result.currentFamilyId,f.family.id);assert.equal(result.dashboard.upcoming[0].id,activity.id);
    assert.equal(result.activity.id,activity.id);assert.equal(result.activity.location,'Home');assert.equal(result.joinRequestCount,1);
    assert.ok(result.families.some((m:any)=>m.family.id===f.family.id));
    assert.equal(JSON.stringify(result).includes(invite.code),false);
  }finally{await app.close();}
});

test('home bootstrap never selects an unauthorized family or exposes private member profiles',async()=>{
  const foreign=await familyRepository.create(outsider.userId,{name:'Unjoined bootstrap family',ownerDisplayName:'Outside'});
  const f=await familyRepository.create(b.userId,{name:'Bootstrap privacy',ownerDisplayName:'B'});
  await familyRepository.updateMember(f.family.id,f.ownerMember.id,b.userId,{version:1,emergencyContact:'private-contact',privateNotes:'private-notes'});
  const result=await homeRepository.get(b.userId,foreign.family.id,f.family.id);
  assert.equal(result.currentFamilyId,f.family.id);
  assert.ok(result.families.every(m=>m.family.id!==foreign.family.id));
  assert.equal(JSON.stringify(result).includes('private-contact'),false);assert.equal(JSON.stringify(result).includes('private-notes'),false);
});

test('home bootstrap gives empty accounts an empty view and ordinary members no admin applications',async()=>{
  const empty=await identityStore.createSession({appId:'test-app',openid:'empty-bootstrap'});
  const result=await homeRepository.get(empty.userId,otherFamily.family.id);
  assert.deepEqual(result,{families:[],currentFamilyId:'',dashboard:null,activity:null,joinRequestCount:0});
  const f=await familyRepository.create(a.userId,{name:'Bootstrap member',ownerDisplayName:'A'});
  const invitation=await familyRepository.invite(f.family.id,a.userId,undefined,{mode:'group',requiresApproval:false});
  await familyRepository.accept(invitation.code,b.userId,'B');
  const privateInvite=await familyRepository.invite(f.family.id,a.userId,undefined,{mode:'group',requiresApproval:true});
  await familyRepository.accept(privateInvite.code,outsider.userId,'Waiting applicant');
  const member=await homeRepository.get(b.userId,f.family.id);
  assert.equal(member.currentFamilyId,f.family.id);assert.equal(member.joinRequestCount,0);
});

test('home bootstrap excludes archived families and Vercel exposes non-sensitive request timing',async()=>{
  const f=await familyRepository.create(a.userId,{name:'Archived bootstrap',ownerDisplayName:'A'});
  await familyRepository.archive(f.family.id,a.userId,f.family.version);
  const result=await homeRepository.get(a.userId,f.family.id,family.family.id);
  assert.equal(result.currentFamilyId,family.family.id);assert.ok(result.families.every(m=>m.family.id!==f.family.id));
  const {default:handler}=await import('../../../api/index.js');
  const headers:Record<string,string>={};let status=0,body:any;
  await handler({query:{path:'/v1/me/home',familyId:family.family.id},method:'GET',headers:{authorization:`Bearer ${a.token}`}},{setHeader(k:string,v:string){headers[k]=v;},status(n:number){status=n;},send(s:string){body=JSON.parse(s);}});
  assert.equal(status,200);assert.equal(body.data.currentFamilyId,family.family.id);assert.match(headers['server-timing'],/^app;dur=\d+(\.\d+)?$/);
  assert.equal(headers['cache-control'],'private, no-store');
});
