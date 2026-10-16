import { randomUUID } from "node:crypto";
import { transaction, one, audit, DomainError, iso, assertUuid, type Transaction } from "../db.js";
import { activeMember, requireActiveMembers } from "./families.js";
import { validateSchedule,nextBirthday,nextOccurrence,shiftLocalDays,type Schedule } from "../reminder-schedule.js";
import { pageWindow,pageResult,type PageInput } from "./pagination.js";

type Row=Record<string,any>;
export interface ReminderInput {
  type:string;title:string;dueAt:string;assigneeMemberId?:string;targetScope?:string;targetMemberIds?:string[];
  frequency?:string;schedule?:Schedule;
  notificationSubscription?:{templateId:string;recipientMemberId:string;subscriptionStatus:string};
}
const statuses=['accept','reject','ban','filter','unavailable'];
const templateFor=(type:string)=>process.env[`WECHAT_${type.toUpperCase()}_TEMPLATE_ID`]?.trim()||process.env.WECHAT_REMINDER_TEMPLATE_ID?.trim();
const occurrenceRow=async(tx:Transaction,familyId:string,id:string)=>{
  const r=await one(tx,"select o.*,p.enabled plan_enabled from nestful.reminder_occurrences o join nestful.reminder_plans p on p.id=o.plan_id where o.family_id=$1 and o.id=$2",[familyId,assertUuid(id)]);
  if(!r)throw new DomainError(404,'reminder_not_found');return r;
};
const dto=async(tx:Transaction,r:Row,actorMemberId:string)=>{
  const members=(await tx.query("select * from nestful.reminder_occurrence_members where occurrence_id=$1 order by member_id",[r.id])).rows;
  const deliveries=(await tx.query(`select id,member_id,template_id,scheduled_at,subscription_status,status,attempt_count,last_error,accepted_at
    from nestful.notification_deliveries where occurrence_id=$1 order by scheduled_at,member_id`,[r.id])).rows;
  const mine=members.find(m=>m.member_id===actorMemberId),snapshot=r.schedule_snapshot;
  const own=deliveries.find(d=>d.member_id===actorMemberId);
  return {id:r.id as string,familyId:r.family_id as string,planId:r.plan_id as string,title:r.title as string,type:r.type as string,dueAt:iso(r.scheduled_at)!,
    frequency:snapshot.frequency as string,schedule:snapshot.schedule as Schedule,targetScope:snapshot.targetScope as string,
    assigneeMemberId:snapshot.assigneeMemberId as string|undefined,createdByMemberId:snapshot.createdByMemberId as string,
    targetMemberIds:members.map(m=>m.member_id as string),enabled:!r.canceled_at&&(r.plan_enabled??true),
    occurrenceStatus:mine?.status??'pending',completedAt:iso(mine?.completed_at),completedByMemberId:mine?.status==='completed'?actorMemberId:undefined,
    participants:members.map(m=>({memberId:m.member_id as string,status:m.status as string,completedAt:iso(m.completed_at)})),
    notification:own?{templateId:own.template_id as string,recipientMemberId:own.member_id as string,subscriptionStatus:own.subscription_status as string,
      sendStatus:own.status as string,attemptCount:own.attempt_count as number,lastError:own.last_error as string|undefined,sentAt:iso(own.accepted_at)}:undefined,
    deliveries:deliveries.map(d=>({id:d.id as string,memberId:d.member_id as string,status:d.status as string,scheduledAt:iso(d.scheduled_at),attemptCount:d.attempt_count as number,lastError:d.last_error as string|undefined}))};
};
const insertOccurrence=async(tx:Transaction,plan:Row,dueAt:string,subscription?:ReminderInput['notificationSubscription'])=>{
  const snapshot={frequency:plan.frequency,schedule:plan.schedule,targetScope:plan.target_scope,assigneeMemberId:plan.assignee_member_id,createdByMemberId:plan.created_by_member_id};
  const row=await one(tx,`insert into nestful.reminder_occurrences(family_id,plan_id,plan_revision,scheduled_at,title,type,schedule_snapshot)
    values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict(plan_id,plan_revision,scheduled_at) do nothing returning *`,
    [plan.family_id,plan.id,plan.revision,dueAt,plan.title,plan.type,JSON.stringify(snapshot)]);
  if(!row)return;
  const members=(await tx.query(plan.target_scope==='family'
    ?"select id from nestful.family_members where family_id=$1 and status='active'"
    :`select m.id from nestful.reminder_plan_members p join nestful.family_members m on m.id=p.member_id
       where p.family_id=$1 and p.plan_id=$2 and m.status='active'`,plan.target_scope==='family'?[plan.family_id]:[plan.family_id,plan.id])).rows;
  for(const m of members){
    await tx.query("insert into nestful.reminder_occurrence_members(family_id,occurrence_id,member_id) values($1,$2,$3)",[plan.family_id,row.id,m.id]);
    const template=plan.schedule.notificationTemplateId;
    if(!template)continue;
    const times=new Set<string>();
    if(plan.type==='birthday'&&(plan.schedule.advanceDays??0)>0)times.add(shiftLocalDays(dueAt,-plan.schedule.advanceDays,plan.timezone));
    if(plan.type!=='birthday'||plan.schedule.notifyOnDay!==false)times.add(dueAt);
    // A single subscription grant authorizes only the next notification, never all future occurrences.
    let usable=subscription?.recipientMemberId===m.id&&subscription?.subscriptionStatus==='accept';
    for(const scheduledAt of [...times].sort()){
      const accepted=usable;usable=false;
      await tx.query(`insert into nestful.notification_deliveries(family_id,occurrence_id,member_id,template_id,scheduled_at,expires_at,
        subscription_status,status,next_attempt_at,last_error) values($1,$2,$3,$4,$5,$6,$7,$8,$5,$9)`,
        [plan.family_id,row.id,m.id,template,scheduledAt,new Date(Date.parse(scheduledAt)+86400000).toISOString(),
          accepted?'accept':subscription?.recipientMemberId===m.id?subscription?.subscriptionStatus??'unavailable':'unavailable',
          accepted?'pending':'skipped',accepted?null:'subscription_reauthorization_required']);
    }
  }
  return row;
};

const preparePlan=async(tx:Transaction,familyId:string,actor:Row,input:ReminderInput)=>{
  if(!['birthday','anniversary','medicine','exercise','bill','activity'].includes(input.type)||!input.title.trim()||!Number.isFinite(Date.parse(input.dueAt)))throw new DomainError(400,'invalid_reminder');
  const f=(await one(tx,"select timezone from nestful.families where id=$1",[familyId]))!;
  const frequency=input.type==='birthday'?'yearly':input.frequency??'once';
  const schedule=validateSchedule(input.schedule,frequency,input.type,f.timezone);
  // Internal-only setting: the client cannot select an arbitrary template.
  delete schedule.notificationTemplateId;
  const template=templateFor(input.type);if(template)schedule.notificationTemplateId=template;
  const scope=input.targetScope??'member';
  if(!['family','member'].includes(scope))throw new DomainError(400,'invalid_target_scope');
  if(input.assigneeMemberId)await requireActiveMembers(tx,familyId,[input.assigneeMemberId]);
  const targets=scope==='member'?await requireActiveMembers(tx,familyId,input.targetMemberIds?.length?input.targetMemberIds:[input.assigneeMemberId??actor.id]):[];
  const subscription=input.notificationSubscription;
  if(subscription){
    if(subscription.recipientMemberId!==actor.id)throw new DomainError(403,'subscription_must_be_self');
    if(scope==='member'&&!targets.includes(actor.id))throw new DomainError(400,'subscription_recipient_not_target');
    if(!template||subscription.templateId!==template||!statuses.includes(subscription.subscriptionStatus))throw new DomainError(400,'invalid_subscription');
  }
  const first=input.type==='birthday'?nextBirthday(new Date(input.dueAt).toISOString(),schedule,f.timezone,true):new Date(input.dueAt).toISOString();
  return {f,frequency,schedule,scope,targets,subscription,first};
};
export const createPlanInTransaction=async(tx:Transaction,familyId:string,actor:Row,input:ReminderInput)=>{
  const {f,frequency,schedule,scope,targets,subscription,first}=await preparePlan(tx,familyId,actor,input);
  const plan=(await one(tx,`insert into nestful.reminder_plans(family_id,type,title,timezone,starts_at,target_scope,assignee_member_id,created_by_member_id,frequency,schedule,next_generation_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$5) returning *`,[familyId,input.type,input.title.trim(),f.timezone,first,scope,input.assigneeMemberId??null,actor.id,frequency,JSON.stringify(schedule)]))!;
  for(const id of targets)await tx.query("insert into nestful.reminder_plan_members(family_id,plan_id,member_id) values($1,$2,$3)",[familyId,plan.id,id]);
  const occurrence=(await insertOccurrence(tx,plan,first,subscription))!;
  const next=nextOccurrence(first,frequency,schedule,f.timezone,first);
  await tx.query("update nestful.reminder_plans set next_generation_at=$2 where id=$1",[plan.id,next??null]);
  plan.next_generation_at=next??null;
  await audit(tx,familyId,actor.id,'reminder.plan.created','reminder_plan',plan.id);
  return {plan,occurrence};
};

export const remindersRepository={
  async plan(familyId:string,id:string,userId:string){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId);
    const p=await one(tx,'select * from nestful.reminder_plans where family_id=$1 and id=$2',[familyId,assertUuid(id)]);
    if(!p)throw new DomainError(404,'plan_not_found');
    if(actor.role!=='admin'&&actor.id!==p.created_by_member_id)throw new DomainError(403,'forbidden');
    const members=(await tx.query('select member_id from nestful.reminder_plan_members where plan_id=$1',[id])).rows;
    return {id,version:p.version as number,type:p.type as string,title:p.title as string,dueAt:iso(p.starts_at)!,
      frequency:p.frequency as string,targetScope:p.target_scope as string,assigneeMemberId:p.assignee_member_id as string|undefined,
      targetMemberIds:members.map(m=>m.member_id as string),schedule:p.schedule as Schedule,enabled:p.enabled as boolean};
  });},
  async pause(familyId:string,id:string,userId:string,version:number){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),p=await one(tx,'select * from nestful.reminder_plans where family_id=$1 and id=$2 for update',[familyId,assertUuid(id)]);
    if(!p)throw new DomainError(404,'plan_not_found');
    if(actor.role!=='admin'&&actor.id!==p.created_by_member_id)throw new DomainError(403,'forbidden');
    if(p.version!==version)throw new DomainError(409,'version_conflict');
    await tx.query('update nestful.reminder_plans set enabled=false,next_generation_at=null,version=version+1,updated_at=now() where id=$1',[id]);
    await tx.query(`update nestful.reminder_occurrences o set canceled_at=coalesce(canceled_at,now()) where plan_id=$1
      and not exists(select 1 from nestful.reminder_occurrence_members m where m.occurrence_id=o.id and m.status='completed')`,[id]);
    await tx.query("update nestful.notification_deliveries set status='canceled',updated_at=now() where status in ('pending','skipped','processing') and occurrence_id in (select id from nestful.reminder_occurrences where plan_id=$1)",[id]);
    await audit(tx,familyId,actor.id,'reminder.plan.paused','reminder_plan',id);return {id,version:version+1};
  });},
  async create(familyId:string,userId:string,input:ReminderInput){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),{occurrence}=await createPlanInTransaction(tx,familyId,actor,input);return dto(tx,occurrence,actor.id);
  });},
  async list(familyId:string,userId:string,input:PageInput={}){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),{limit,after}=pageWindow(input);
    const rows=(await tx.query(`select o.*,p.enabled plan_enabled from nestful.reminder_occurrences o join nestful.reminder_plans p on p.id=o.plan_id where o.family_id=$1
      and ($2::timestamptz is null or (o.scheduled_at,o.id)<($2::timestamptz,$3::uuid)) order by o.scheduled_at desc,o.id desc limit $4`,[familyId,after?.time??null,after?.id??null,limit+1])).rows;
    const data=[];for(const r of rows)data.push(await dto(tx,r,actor.id));return pageResult(data,limit,r=>r.dueAt);
  });},
  async complete(familyId:string,id:string,userId:string){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),r=await occurrenceRow(tx,familyId,id);
    if(r.canceled_at||!r.plan_enabled)throw new DomainError(409,'reminder_canceled');
    const changed=await tx.query(`update nestful.reminder_occurrence_members set status='completed',completed_at=coalesce(completed_at,now())
      where occurrence_id=$1 and member_id=$2 returning member_id`,[id,actor.id]);
    if(!changed.rowCount)throw new DomainError(403,'not_reminder_participant');
    await audit(tx,familyId,actor.id,'reminder.completed','reminder',id);return dto(tx,r,actor.id);
  });},
  async updatePlan(familyId:string,id:string,userId:string,input:ReminderInput&{version:number;enabled?:boolean}){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId);
    const old=await one(tx,"select * from nestful.reminder_plans where family_id=$1 and id=$2 for update",[familyId,assertUuid(id)]);
    if(!old)throw new DomainError(404,'plan_not_found');
    if(actor.role!=='admin'&&actor.id!==old.created_by_member_id)throw new DomainError(403,'forbidden');
    if(old.version!==input.version)throw new DomainError(409,'version_conflict');
    const prepared=await preparePlan(tx,familyId,actor,input);
    if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw new DomainError(400,'invalid_enabled');
    await tx.query("update nestful.reminder_occurrences set canceled_at=now() where plan_id=$1 and scheduled_at>now() and canceled_at is null",[id]);
    await tx.query(`update nestful.notification_deliveries set status='canceled' where status in ('pending','skipped')
      and occurrence_id in (select id from nestful.reminder_occurrences where plan_id=$1 and (canceled_at is not null or $2=false))`,[id,input.enabled??true]);
    await tx.query("delete from nestful.reminder_plan_members where plan_id=$1",[id]);
    const updated=(await one(tx,`update nestful.reminder_plans set type=$2,title=$3,starts_at=$4,target_scope=$5,assignee_member_id=$6,frequency=$7,schedule=$8,
      next_generation_at=null,enabled=$9,revision=revision+1,version=version+1,updated_at=now() where id=$1 returning *`,
      [id,input.type,input.title.trim(),prepared.first,prepared.scope,input.assigneeMemberId??null,prepared.frequency,prepared.schedule,input.enabled??true]))!;
    for(const memberId of prepared.targets)await tx.query("insert into nestful.reminder_plan_members(family_id,plan_id,member_id) values($1,$2,$3)",[familyId,id,memberId]);
    if(updated.enabled){
      await insertOccurrence(tx,updated,prepared.first,prepared.subscription);
      const next=nextOccurrence(prepared.first,prepared.frequency,prepared.schedule,prepared.f.timezone,prepared.first);
      await tx.query("update nestful.reminder_plans set next_generation_at=$2 where id=$1",[id,next??null]);
    }
    await audit(tx,familyId,actor.id,'reminder.plan.updated','reminder_plan',id);
    return {id,version:old.version+1,revision:old.revision+1};
  });},
  async subscribe(familyId:string,id:string,userId:string,input:{templateId:string;subscriptionStatus:string}){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),r=await occurrenceRow(tx,familyId,id);
    if(r.canceled_at||!r.plan_enabled)throw new DomainError(409,'reminder_canceled');
    if(input.templateId!==templateFor(r.type)||!statuses.includes(input.subscriptionStatus))throw new DomainError(400,'invalid_subscription');
    const own=await one(tx,"select * from nestful.reminder_occurrence_members where occurrence_id=$1 and member_id=$2",[id,actor.id]);
    if(!own)throw new DomainError(403,'not_reminder_participant');
    const delivery=await one(tx,`select * from nestful.notification_deliveries where occurrence_id=$1 and member_id=$2
      and scheduled_at>now() and status in ('skipped','pending') order by scheduled_at for update limit 1`,[id,actor.id]);
    if(!delivery)throw new DomainError(409,'no_upcoming_delivery');
    await tx.query(`update nestful.notification_deliveries set subscription_status=$2,status=$3,last_error=$4,requested_at=now(),updated_at=now() where id=$1`,
      [delivery.id,input.subscriptionStatus,input.subscriptionStatus==='accept'?'pending':'skipped',input.subscriptionStatus==='accept'?null:'subscription_not_accepted']);
    return dto(tx,r,actor.id);
  });},
  async generate(at=new Date()){
    return transaction(async tx=>{
      // Materialize birthday advance notifications up to 30 days ahead. Other plans get the next day.
      const plans=(await tx.query(`select p.* from nestful.reminder_plans p join nestful.families f on f.id=p.family_id where p.enabled and f.archived_at is null and p.next_generation_at<=
        $1::timestamptz+case when type='birthday' then interval '31 days' else interval '1 day' end
        order by p.next_generation_at for update of p skip locked limit 50`,[at])).rows;
      let generated=0;
      for(const plan of plans){
        const horizon=at.getTime()+(plan.type==='birthday'?31:1)*86400000;let next=iso(plan.next_generation_at);
        for(let i=0;i<200&&next&&Date.parse(next)<=horizon;i++){
          if(await insertOccurrence(tx,plan,next))generated++;
          next=nextOccurrence(next,plan.frequency,plan.schedule,plan.timezone,iso(plan.starts_at)!);
        }
        await tx.query("update nestful.reminder_plans set next_generation_at=$2 where id=$1",[plan.id,next??null]);
      }
      return generated;
    });
  },
  async dispatch(send:(input:{reminder:any;recipientOpenId:string;templateId:string})=>Promise<{ok:boolean;skipped?:boolean;error?:string;unknown?:boolean}>,at=new Date()){
    const dispatchStarted=Date.now();
    await this.generate(at);
    await transaction(async tx=>{
      await tx.query(`update nestful.notification_deliveries set status=case when send_started_at is null then 'pending' else 'unknown' end,
        last_error='worker_lease_expired',lease_token=null,lease_expires_at=null where status='processing' and lease_expires_at<$1`,[at]);
      await tx.query("update nestful.notification_deliveries set status='expired',last_error='notification_expired' where status='pending' and expires_at<=$1",[at]);
      await tx.query(`update nestful.notification_deliveries d set status='canceled' from nestful.family_members m
        where d.member_id=m.id and m.status='inactive' and d.status='pending'`);
    });
    const summary={due:0,sent:0,failed:0,skipped:0,notConfigured:0,unknown:0};
    // Claim one task at a time so queued work doesn't expire behind slow network requests.
    for(let i=0;i<30;i++){
      const lease=randomUUID(),claimAt=new Date(at.getTime()+Date.now()-dispatchStarted);
      const task=await transaction(tx=>one(tx,`update nestful.notification_deliveries set status='processing',lease_token=$2,
        lease_expires_at=$1::timestamptz+interval '60 seconds',send_started_at=null,updated_at=now()
        where id=(select id from nestful.notification_deliveries where status='pending' and subscription_status='accept'
        and next_attempt_at<=$1 and expires_at>$1 and attempt_count<3 order by next_attempt_at for update skip locked limit 1) returning *`,[claimAt,lease]));
      if(!task)break;summary.due++;
      const recipient=await transaction(tx=>one(tx,`select i.openid from nestful.family_members m join nestful.users u on u.id=m.user_id
        join nestful.wechat_identities i on i.user_id=m.user_id join nestful.families f on f.id=m.family_id
        where m.id=$1 and m.status='active' and u.status='active' and f.archived_at is null and i.app_id=$2`,[task.member_id,process.env.WECHAT_APP_ID]));
      const r=await transaction(tx=>one(tx,"select * from nestful.reminder_occurrences where id=$1 and canceled_at is null",[task.occurrence_id]));
      if(!recipient||!r){await transaction(tx=>tx.query("update nestful.notification_deliveries set status='canceled',last_error='recipient_or_occurrence_unavailable' where id=$1 and lease_token=$2",[task.id,lease]));summary.skipped++;continue;}
      const started=await transaction(tx=>tx.query("update nestful.notification_deliveries set send_started_at=now(),attempt_count=attempt_count+1 where id=$1 and lease_token=$2 and status='processing' returning id",[task.id,lease]));
      if(!started.rowCount)continue;
      let result:Awaited<ReturnType<typeof send>>;
      try{result=await send({reminder:{id:r.id,title:r.title,type:r.type,dueAt:iso(r.scheduled_at),schedule:r.schedule_snapshot.schedule},recipientOpenId:recipient.openid,templateId:task.template_id});}
      catch{result={ok:false,unknown:true,error:'provider_result_unknown'};}
      const status=result.ok?'sent':result.unknown?'unknown':result.skipped?'skipped':task.attempt_count+1>=3?'failed':'pending';
      await transaction(tx=>tx.query(`update nestful.notification_deliveries set status=$3,last_error=$4,accepted_at=case when $3='sent' then now() end,
        lease_token=null,lease_expires_at=null,next_attempt_at=$5,updated_at=now() where id=$1 and lease_token=$2 and status='processing'`,
        [task.id,lease,status,result.ok?null:result.error??'provider_rejected',new Date(claimAt.getTime()+60000)]));
      if(result.ok)summary.sent++;else if(result.unknown)summary.unknown++;else if(result.skipped)summary.notConfigured++;else summary.failed++;
    }
    return summary;
  },
};
