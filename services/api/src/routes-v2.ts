import type { FastifyInstance,FastifyRequest } from 'fastify';
import { DomainError,query,transaction,assertUuid,iso } from './db.js';
import { identityStore } from './repositories/identity.js';
import { familyRepository,activeMember } from './repositories/families.js';
import { activitiesRepository } from './repositories/activities.js';
import { spaceRepository } from './repositories/space.js';
import { remindersRepository } from './repositories/reminders.js';
import { ledgerRepository } from './repositories/ledger.js';
import { dashboardRepository } from './repositories/dashboard.js';
import { pageWindow,pageResult } from './repositories/pagination.js';
import { exchangeWechatCode,getReminderSubscriptionConfig,sendReminderSubscriptionMessage } from './wechat.js';

const bearer=(r:FastifyRequest)=>r.headers.authorization?.startsWith('Bearer ')?r.headers.authorization.slice(7):undefined;
const body=(r:FastifyRequest):Record<string,any>=>{
  if(!r.body||typeof r.body!=='object'||Array.isArray(r.body))throw new DomainError(400,'body_required');return r.body as Record<string,any>;
};
const text=(o:Record<string,any>,key:string,required=false):string|undefined=>{
  if(o[key]===undefined&&!required)return undefined;
  if(typeof o[key]!=='string'||!o[key].trim()||o[key].length>10000)throw new DomainError(400,`invalid_${key}`);return o[key].trim();
};
const strings=(o:Record<string,any>,key:string):string[]|undefined=>{
  if(o[key]===undefined)return undefined;
  if(!Array.isArray(o[key])||o[key].length>100||o[key].some((v:unknown)=>typeof v!=='string'))throw new DomainError(400,`invalid_${key}`);return o[key];
};
const version=(o:Record<string,any>)=>{if(!Number.isInteger(o.version)||o.version<1)throw new DomainError(400,'version_required');return o.version as number;};
const params=(r:FastifyRequest)=>r.params as Record<string,string>;
const pagination=(r:FastifyRequest)=>{
  const q=(r.query??{}) as Record<string,string>;return {limit:q.limit===undefined?undefined:Number(q.limit),cursor:q.cursor};
};
const user=async(r:FastifyRequest)=>{
  const session=await identityStore.getUserSession(bearer(r));if(!session)throw new DomainError(401,'unauthorized');return session.user;
};
const forbiddenIdentity=(o:Record<string,any>)=>{
  // Reject instead of silently trusting old actor-bearing payloads.
  if(['ownerUserId','ownerWechatOpenId','userId','wechatOpenId','createdByMemberId','actorMemberId'].some(k=>o[k]!==undefined))throw new DomainError(400,'actor_fields_not_allowed');
};
const reminderInput=(o:Record<string,any>)=>{
  forbiddenIdentity(o);
  if(o.schedule!==undefined&&(!o.schedule||typeof o.schedule!=='object'||Array.isArray(o.schedule)))throw new DomainError(400,'invalid_schedule');
  const subscription=o.notificationSubscription;
  if(subscription!==undefined&&(!subscription||typeof subscription!=='object'||Array.isArray(subscription)))throw new DomainError(400,'invalid_subscription');
  return {type:text(o,'type',true)!,title:text(o,'title',true)!,dueAt:text(o,'dueAt',true)!,assigneeMemberId:text(o,'assigneeMemberId'),
    targetScope:text(o,'targetScope'),targetMemberIds:strings(o,'targetMemberIds'),frequency:text(o,'frequency'),schedule:o.schedule,
    notificationSubscription:subscription?{templateId:text(subscription,'templateId',true)!,recipientMemberId:text(subscription,'recipientMemberId',true)!,subscriptionStatus:text(subscription,'subscriptionStatus',true)!}:undefined};
};
const ledgerInput=(o:Record<string,any>)=>{
  forbiddenIdentity(o);return {type:text(o,'type',true)!,category:text(o,'category',true)!,title:text(o,'title',true)!,amountCents:o.amountCents,
    paidByMemberId:text(o,'paidByMemberId',true)!,splitMemberIds:strings(o,'splitMemberIds'),occurredAt:text(o,'occurredAt',true)!,recurrence:text(o,'recurrence')};
};
interface Dependencies {exchangeCode?:(code:string)=>Promise<{appId:string;openid:string;unionid?:string}>}
export async function registerRoutes(server:FastifyInstance,deps:Dependencies={}) {
  server.setErrorHandler((error,request,reply)=>{
    if(error instanceof DomainError)return reply.code(error.status).send({error:error.code});
    const pgCode=(error as {code?:string}).code;
    if(pgCode==='23514')return reply.code(409).send({error:(error instanceof Error&&error.message.includes('last_admin_required'))?'last_admin_required':'constraint_conflict'});
    if(pgCode==='23505')return reply.code(409).send({error:'duplicate_record'});
    if(pgCode==='23503'||pgCode==='22P02'||pgCode==='22007'||pgCode==='22008'||pgCode==='23502')return reply.code(400).send({error:'invalid_reference_or_value'});
    request.log.error({code:pgCode??'internal'},'API request failed');
    return reply.code(500).send({error:'internal_error'});
  });
  server.get('/health',async(_r,reply)=>{
    try{await query('select id from nestful.users limit 0');return {ok:true,service:'nestful-api',storage:'relational-v2'};}
    catch{return reply.code(503).send({ok:false,service:'nestful-api',error:'database_unavailable'});}
  });
  server.post('/v1/wechat/session',async r=>{
    const code=text(body(r),'code',true)!;
    try{
      const identity=await (deps.exchangeCode??exchangeWechatCode)(code);
      return {data:await identityStore.createSession(identity)};
    }catch(error){if(error instanceof DomainError)throw error;throw new DomainError(502,'wechat_session_failed');}
  });
  server.post('/v1/wechat/logout',async r=>{await user(r);await identityStore.revokeSession(bearer(r)!);return {data:{ok:true}};});
  server.get('/v1/me/families',async r=>({data:await familyRepository.memberships((await user(r)).id)}));
  server.post('/v1/families',async(r,reply)=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);
    return reply.code(201).send({data:await familyRepository.create(u.id,{name:text(b,'name',true)!,ownerDisplayName:text(b,'ownerDisplayName',true)!})});
  });
  // No global GET /v1/families directory and no direct member-creation endpoint.
  server.get('/v1/families/:familyId',async r=>({data:await familyRepository.get(params(r).familyId,(await user(r)).id)}));
  server.get('/v1/families/:familyId/dashboard',async r=>({data:await dashboardRepository.get(params(r).familyId,(await user(r)).id)}));
  server.put('/v1/families/:familyId',async r=>{const u=await user(r),b=body(r);return {data:await familyRepository.rename(params(r).familyId,u.id,text(b,'name',true)!,version(b))};});
  server.post('/v1/families/:familyId/archive',async r=>({data:await familyRepository.archive(params(r).familyId,(await user(r)).id,version(body(r)))}));
  server.get('/v1/families/:familyId/members',async r=>({data:await familyRepository.members(params(r).familyId,(await user(r)).id)}));
  server.get('/v1/families/:familyId/members/:memberId',async r=>({data:await familyRepository.member(params(r).familyId,params(r).memberId,(await user(r)).id)}));
  server.put('/v1/families/:familyId/members/:memberId',async r=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);version(b);
    const allowed=['version','displayName','role','status','identityTag','birthday','birthdayCalendar','birthdayLeapMonth','location','emergencyContact','privateNotes'];
    if(Object.keys(b).some(k=>!allowed.includes(k)))throw new DomainError(400,'invalid_member_field');
    return {data:await familyRepository.updateMember(params(r).familyId,params(r).memberId,u.id,b)};
  });
  server.delete('/v1/families/:familyId/members/:memberId',async r=>{
    const u=await user(r),b=body(r);return {data:await familyRepository.updateMember(params(r).familyId,params(r).memberId,u.id,{version:version(b),status:'inactive'})};
  });
  server.post('/v1/families/:familyId/invitations',async(r,reply)=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);
    if(b.role!==undefined&&b.role!=='member')throw new DomainError(400,'invitation_role_must_be_member');
    return reply.code(201).send({data:await familyRepository.invite(params(r).familyId,u.id,text(b,'expiresAt'),{mode:text(b,'mode'),maxUses:b.maxUses,requiresApproval:b.requiresApproval})});
  });
  server.get('/v1/families/:familyId/invitations',async r=>({data:await familyRepository.invitations(params(r).familyId,(await user(r)).id)}));
  server.get('/v1/families/:familyId/join-requests',async r=>({data:await familyRepository.joinRequests(params(r).familyId,(await user(r)).id)}));
  server.post('/v1/families/:familyId/join-requests/:requestId/decision',async r=>({data:await familyRepository.decideJoin(params(r).familyId,params(r).requestId,(await user(r)).id,text(body(r),'decision',true)!)}));
  server.delete('/v1/families/:familyId/invitations/:invitationId',async r=>({data:await familyRepository.cancelInvitation(params(r).familyId,params(r).invitationId,(await user(r)).id)}));
  server.get('/v1/invitations/:code',async r=>({data:await familyRepository.invitation(params(r).code)}));
  server.get('/v1/invitations/:code/status',async r=>({data:await familyRepository.joinStatus(params(r).code,(await user(r)).id)}));
  server.post('/v1/invitations/:code/accept',async r=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);return {data:await familyRepository.accept(params(r).code,u.id,text(b,'displayName',true)!)};
  });
  server.get('/v1/reminders/subscription-config',async()=>({data:getReminderSubscriptionConfig()}));
  server.get('/v1/reminders/subscription-config/:type',async r=>{
    const type=params(r).type;
    if(!['birthday','medicine','exercise','bill','anniversary','activity'].includes(type))throw new DomainError(400,'invalid_type');
    return {data:getReminderSubscriptionConfig(type as any)};
  });
  server.get('/v1/families/:familyId/reminders',async r=>remindersRepository.list(params(r).familyId,(await user(r)).id,pagination(r)));
  server.post('/v1/families/:familyId/reminders',async(r,reply)=>{
    const u=await user(r);return reply.code(201).send({data:await remindersRepository.create(params(r).familyId,u.id,reminderInput(body(r)))});
  });
  server.put('/v1/families/:familyId/reminder-plans/:planId',async r=>{
    const u=await user(r),b=body(r);return {data:await remindersRepository.updatePlan(params(r).familyId,params(r).planId,u.id,{...reminderInput(b),version:version(b),enabled:b.enabled})};
  });
  server.get('/v1/families/:familyId/reminder-plans/:planId',async r=>({data:await remindersRepository.plan(params(r).familyId,params(r).planId,(await user(r)).id)}));
  server.post('/v1/families/:familyId/reminder-plans/:planId/pause',async r=>({data:await remindersRepository.pause(params(r).familyId,params(r).planId,(await user(r)).id,version(body(r)))}));
  server.post('/v1/reminders/:reminderId/complete',async r=>{
    const u=await user(r),id=assertUuid(params(r).reminderId);
    const row=(await query("select family_id from nestful.reminder_occurrences where id=$1",[id]))[0];
    if(!row)throw new DomainError(404,'reminder_not_found');
    return {data:await remindersRepository.complete(row.family_id,id,u.id)};
  });
  server.post('/v1/families/:familyId/reminders/:reminderId/subscription',async r=>{
    const u=await user(r),b=body(r);return {data:await remindersRepository.subscribe(params(r).familyId,params(r).reminderId,u.id,{templateId:text(b,'templateId',true)!,subscriptionStatus:text(b,'subscriptionStatus',true)!})};
  });
  const dispatch=async(r:FastifyRequest)=>{
    const secret=process.env.CRON_SECRET?.trim()||process.env.NESTFUL_CRON_SECRET?.trim();
    if(!secret)throw new DomainError(503,'scheduler_not_configured');
    if(bearer(r)!==secret)throw new DomainError(401,'unauthorized');
    return {data:await remindersRepository.dispatch(sendReminderSubscriptionMessage)};
  };
  server.get('/v1/reminders/dispatch-due',dispatch);server.post('/v1/reminders/dispatch-due',dispatch);
  server.get('/v1/families/:familyId/activities',async r=>activitiesRepository.list(params(r).familyId,(await user(r)).id,pagination(r)));
  server.get('/v1/activities/:activityId/entry',async r=>({data:await activitiesRepository.entry(params(r).activityId,(await user(r)).id,text((r.query??{}) as Record<string,any>,'code'))}));
  server.get('/v1/families/:familyId/activities/:activityId',async r=>({data:await activitiesRepository.get(params(r).familyId,params(r).activityId,(await user(r)).id)}));
  server.put('/v1/families/:familyId/activities/:activityId',async r=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);
    if(b.location!==undefined&&typeof b.location!=='string'||b.description!==undefined&&typeof b.description!=='string')throw new DomainError(400,'invalid_activity');
    return {data:await activitiesRepository.update(params(r).familyId,params(r).activityId,u.id,{title:text(b,'title',true)!,startsAt:text(b,'startsAt',true)!,location:b.location,description:b.description,version:version(b)})};
  });
  server.post('/v1/families/:familyId/activities',async(r,reply)=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);
    if(b.tasks!==undefined&&(!Array.isArray(b.tasks)||b.tasks.length>100))throw new DomainError(400,'invalid_tasks');
    return reply.code(201).send({data:await activitiesRepository.create(params(r).familyId,u.id,{title:text(b,'title',true)!,startsAt:text(b,'startsAt',true)!,location:text(b,'location'),description:text(b,'description'),budgetCents:b.budgetCents,status:text(b,'status'),participantMemberIds:strings(b,'participantMemberIds'),tasks:b.tasks?.map((t:any)=>({title:text(t,'title',true)!,assigneeMemberId:text(t,'assigneeMemberId')}))})});
  });
  server.post('/v1/families/:familyId/activities/:activityId/rsvp',async r=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);if(b.memberId!==undefined)throw new DomainError(400,'actor_fields_not_allowed');
    return {data:await activitiesRepository.rsvp(params(r).familyId,params(r).activityId,u.id,text(b,'rsvp',true)!)};
  });
  server.post('/v1/families/:familyId/activities/:activityId/tasks',async(r,reply)=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);
    return reply.code(201).send({data:await activitiesRepository.createTask(params(r).familyId,params(r).activityId,u.id,{title:text(b,'title',true)!,assigneeMemberId:text(b,'assigneeMemberId')})});
  });
  server.put('/v1/families/:familyId/activities/:activityId/tasks/:taskId',async r=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);return {data:await activitiesRepository.updateTask(params(r).familyId,params(r).activityId,params(r).taskId,u.id,text(b,'status',true)!,version(b))};
  });
  server.put('/v1/families/:familyId/activities/:activityId/status',async r=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);return {data:await activitiesRepository.status(params(r).familyId,params(r).activityId,u.id,text(b,'status',true)!,version(b))};
  });
  server.post('/v1/families/:familyId/activities/:activityId/save-memory',async r=>({data:await spaceRepository.saveActivityMemory(params(r).familyId,params(r).activityId,(await user(r)).id)}));
  server.get('/v1/families/:familyId/ledger-entries',async r=>ledgerRepository.entries(params(r).familyId,(await user(r)).id,pagination(r)));
  server.post('/v1/families/:familyId/ledger-entries',async(r,reply)=>{const u=await user(r);return reply.code(201).send({data:await ledgerRepository.createEntry(params(r).familyId,u.id,ledgerInput(body(r)))});});
  server.put('/v1/families/:familyId/ledger-entries/:entryId',async r=>{const u=await user(r),b=body(r);return {data:await ledgerRepository.updateEntry(params(r).familyId,params(r).entryId,u.id,{...ledgerInput(b),version:version(b)})};});
  server.delete('/v1/families/:familyId/ledger-entries/:entryId',async r=>({data:await ledgerRepository.voidEntry(params(r).familyId,params(r).entryId,(await user(r)).id,version(body(r)))}));
  server.get('/v1/families/:familyId/ledger-summary',async r=>({data:await ledgerRepository.summary(params(r).familyId,(await user(r)).id,(r.query as {month?:string}).month)}));
  server.get('/v1/families/:familyId/ledger-goal-funds',async r=>ledgerRepository.goals(params(r).familyId,(await user(r)).id,pagination(r)));
  server.post('/v1/families/:familyId/ledger-goal-funds',async(r,reply)=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);return reply.code(201).send({data:await ledgerRepository.createGoal(params(r).familyId,u.id,{title:text(b,'title',true)!,targetAmountCents:b.targetAmountCents,currentAmountCents:b.currentAmountCents,dueAt:text(b,'dueAt')})});
  });
  server.put('/v1/families/:familyId/ledger-goal-funds/:goalId',async r=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);return {data:await ledgerRepository.updateGoal(params(r).familyId,params(r).goalId,u.id,{version:version(b),title:text(b,'title',true)!,targetAmountCents:b.targetAmountCents,currentAmountCents:b.currentAmountCents,dueAt:text(b,'dueAt')})};
  });
  server.get('/v1/families/:familyId/digital-space-items',async r=>spaceRepository.list(params(r).familyId,(await user(r)).id,{...pagination(r),kind:(r.query as {kind?:string}).kind}));
  server.post('/v1/families/:familyId/digital-space-items',async(r,reply)=>{
    const u=await user(r),b=body(r);forbiddenIdentity(b);
    if(b.activityId!==undefined)throw new DomainError(400,'use_activity_save_memory');
    if(b.mediaItems!==undefined&&(!Array.isArray(b.mediaItems)||b.mediaItems.length>100))throw new DomainError(400,'invalid_media');
    return reply.code(201).send({data:await spaceRepository.create(params(r).familyId,u.id,{kind:text(b,'kind',true)!,title:text(b,'title',true)!,summary:text(b,'summary'),url:text(b,'url'),occurredAt:text(b,'occurredAt'),place:text(b,'place'),taggedMemberIds:strings(b,'taggedMemberIds'),mediaItems:b.mediaItems?.map((m:any)=>({kind:text(m,'kind',true)!,label:text(m,'label'),url:text(m,'url'),mimeType:text(m,'mimeType'),sizeBytes:m.sizeBytes}))})});
  });
  server.get('/v1/families/:familyId/audit-events',async r=>{
    const u=await user(r),familyId=params(r).familyId,{limit,after}=pageWindow(pagination(r));
    return transaction(async tx=>{
      await activeMember(tx,familyId,u.id,true);
      const rows=(await tx.query(`select id,family_id,actor_member_id,action,resource_type,resource_id,created_at from nestful.audit_events
        where family_id=$1 and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid)) order by created_at desc,id desc limit $4`,[familyId,after?.time??null,after?.id??null,limit+1])).rows;
      return pageResult(rows.map(e=>({id:e.id as string,familyId:e.family_id as string,actorMemberId:e.actor_member_id as string|undefined,action:e.action as string,resourceType:e.resource_type as string,resourceId:e.resource_id as string,createdAt:iso(e.created_at)!})),limit,e=>e.createdAt);
    });
  });
}
