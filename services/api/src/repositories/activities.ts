import { transaction, one, audit, DomainError, iso, assertUuid, type Transaction } from "../db.js";
import { activeMember, requireActiveMembers, familyDto, memberDto } from "./families.js";
import { pageWindow,pageResult,type PageInput } from "./pagination.js";
import { createHash } from 'node:crypto';

export const activityDto=async(tx:Transaction,r:Record<string,any>)=>{
  const participants=(await tx.query("select * from nestful.activity_participants where family_id=$1 and activity_id=$2 order by member_id",[r.family_id,r.id])).rows.map(p=>({activityId:p.activity_id,memberId:p.member_id,rsvp:p.rsvp,joinedAt:iso(p.joined_at)}));
  const tasks=(await tx.query("select * from nestful.activity_tasks where family_id=$1 and activity_id=$2 order by created_at,id",[r.family_id,r.id])).rows.map(taskDto);
  return {id:r.id as string,familyId:r.family_id as string,title:r.title as string,startsAt:iso(r.starts_at)!,location:r.location as string|undefined,
    description:r.description as string|undefined,budgetCents:r.budget_cents===null?undefined:Number(r.budget_cents),status:r.status as string,
    createdByMemberId:r.created_by_member_id as string,version:r.version as number,createdAt:iso(r.created_at)!,completedAt:iso(r.completed_at),cancelledAt:iso(r.cancelled_at),participants,tasks,
    updatedAt:iso(r.updated_at),sharePath:`/pages/activities/index?familyId=${r.family_id}&activityId=${r.id}`,shareText:`家庭活动：${r.title}\n时间：${iso(r.starts_at)}\n打开家庭助手查看详情。`};
};
const taskDto=(r:Record<string,any>)=>({id:r.id as string,familyId:r.family_id as string,activityId:r.activity_id as string,title:r.title as string,
  assigneeMemberId:r.assignee_member_id as string|undefined,status:r.status as string,createdByMemberId:r.created_by_member_id as string,version:r.version as number,completedAt:iso(r.completed_at)});
const activityRow=async(tx:Transaction,familyId:string,id:string,lock=false)=>{
  const r=await one(tx,`select * from nestful.activities where family_id=$1 and id=$2 and archived_at is null ${lock?'for update':''}`,[familyId,assertUuid(id)]);
  if(!r)throw new DomainError(404,'activity_not_found');return r;
};
const requireManager=(activity:Record<string,any>,actor:Record<string,any>)=>{
  if(activity.created_by_member_id!==actor.id&&actor.role!=='admin')throw new DomainError(403,'forbidden');
};

export const activitiesRepository={
  async entry(id:string,userId:string,code?:string){return transaction(async tx=>{
    const a=await one(tx,`select a.*,to_jsonb(f) family from nestful.activities a join nestful.families f on f.id=a.family_id
      where a.id=$1 and a.archived_at is null and f.archived_at is null`,[assertUuid(id)]);
    if(!a)throw new DomainError(404,'activity_unavailable');
    const member=await one(tx,"select * from nestful.family_members where family_id=$1 and user_id=$2 and status='active'",[a.family_id,userId]);
    if(member)return {access:'member' as const,familyId:a.family_id as string,family:familyDto(a.family),member:memberDto(member)};
    if(code){
      const i=await one(tx,`select i.id from nestful.family_invitations i join nestful.family_members m on m.id=i.created_by_member_id
        where i.family_id=$1 and i.code_hash=$2 and i.canceled_at is null and i.accepted_at is null and i.expires_at>now()
        and (i.mode='single' or i.use_count<i.max_uses) and m.status='active' and m.role='admin'`,
        [a.family_id,createHash('sha256').update(code).digest('hex')]);
      if(i)return {access:'invitation' as const,title:a.title as string,startsAt:iso(a.starts_at),familyId:a.family_id as string};
    }
    throw new DomainError(403,'family_invitation_required');
  });},
  async update(familyId:string,id:string,userId:string,input:{title:string;startsAt:string;location?:string;description?:string;version:number}){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),a=await activityRow(tx,familyId,id,true);requireManager(a,actor);
    if(!['draft','scheduled'].includes(a.status))throw new DomainError(409,'activity_closed');
    if(a.version!==input.version)throw new DomainError(409,'version_conflict');
    if(!input.title.trim()||!Number.isFinite(Date.parse(input.startsAt)))throw new DomainError(400,'invalid_activity');
    const changed=a.title!==input.title.trim()||iso(a.starts_at)!==new Date(input.startsAt).toISOString()||(a.location??'')!==(input.location??'');
    const updated=(await one(tx,`update nestful.activities set title=$3,starts_at=$4,location=$5,description=$6,
      version=version+1,updated_at=now() where family_id=$1 and id=$2 returning *`,
      [familyId,id,input.title.trim(),input.startsAt,input.location??null,input.description??null]))!;
    if(changed)await tx.query("update nestful.activity_participants set rsvp='pending' where activity_id=$1 and member_id<>$2",[id,actor.id]);
    await audit(tx,familyId,actor.id,'activity.updated','activity',id);return activityDto(tx,updated);
  });},
  async list(familyId:string,userId:string,input:PageInput={}){
    return transaction(async tx=>{
      await activeMember(tx,familyId,userId);const {limit,after}=pageWindow(input);
      const rows=(await tx.query(`select * from nestful.activities where family_id=$1 and archived_at is null
        and ($2::timestamptz is null or (starts_at,id)<($2::timestamptz,$3::uuid)) order by starts_at desc,id desc limit $4`,[familyId,after?.time??null,after?.id??null,limit+1])).rows;
      const data=[];for(const row of rows)data.push(await activityDto(tx,row));
      return pageResult(data,limit,r=>r.startsAt);
    });
  },
  async get(familyId:string,id:string,userId:string){return transaction(async tx=>{await activeMember(tx,familyId,userId);return activityDto(tx,await activityRow(tx,familyId,id));});},
  async create(familyId:string,userId:string,input:{title:string;startsAt:string;location?:string;description?:string;budgetCents?:number;status?:string;participantMemberIds?:string[];tasks?:Array<{title:string;assigneeMemberId?:string}>}){
    return transaction(async tx=>{
      const actor=await activeMember(tx,familyId,userId);
      if(!input.title.trim()||!Number.isFinite(Date.parse(input.startsAt)))throw new DomainError(400,'invalid_activity');
      if(input.budgetCents!==undefined&&(!Number.isSafeInteger(input.budgetCents)||input.budgetCents<0))throw new DomainError(400,'invalid_amount');
      if(input.status&&!['draft','scheduled'].includes(input.status))throw new DomainError(400,'invalid_status');
      const members=await requireActiveMembers(tx,familyId,[actor.id,...input.participantMemberIds??[]]);
      const row=(await one(tx,`insert into nestful.activities(family_id,title,starts_at,location,description,budget_cents,status,created_by_member_id)
        values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[familyId,input.title.trim(),input.startsAt,input.location??null,input.description??null,input.budgetCents??null,input.status??'scheduled',actor.id]))!;
      for(const id of members)await tx.query("insert into nestful.activity_participants(family_id,activity_id,member_id,rsvp) values($1,$2,$3,$4)",[familyId,row.id,id,id===actor.id?'accepted':'pending']);
      for(const task of input.tasks??[]){
        if(!task.title.trim())throw new DomainError(400,'task_title_required');
        if(task.assigneeMemberId)await requireActiveMembers(tx,familyId,[task.assigneeMemberId]);
        await tx.query("insert into nestful.activity_tasks(family_id,activity_id,title,assignee_member_id,created_by_member_id) values($1,$2,$3,$4,$5)",[familyId,row.id,task.title.trim(),task.assigneeMemberId??null,actor.id]);
      }
      await audit(tx,familyId,actor.id,'activity.created','activity',row.id);return activityDto(tx,row);
    });
  },
  async rsvp(familyId:string,id:string,userId:string,rsvp:string){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),a=await activityRow(tx,familyId,id,true);
    if(!['draft','scheduled'].includes(a.status))throw new DomainError(409,'activity_closed');
    if(!['accepted','declined','tentative','pending'].includes(rsvp))throw new DomainError(400,'invalid_rsvp');
    await tx.query(`insert into nestful.activity_participants(family_id,activity_id,member_id,rsvp) values($1,$2,$3,$4)
      on conflict(activity_id,member_id) do update set rsvp=$4`,[familyId,id,actor.id,rsvp]);
    await audit(tx,familyId,actor.id,'activity.rsvp.updated','activity',id);return activityDto(tx,a);
  });},
  async createTask(familyId:string,id:string,userId:string,input:{title:string;assigneeMemberId?:string}){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),a=await activityRow(tx,familyId,id,true);requireManager(a,actor);
    if(!['draft','scheduled'].includes(a.status))throw new DomainError(409,'activity_closed');
    if(!input.title.trim())throw new DomainError(400,'task_title_required');
    if(input.assigneeMemberId)await requireActiveMembers(tx,familyId,[input.assigneeMemberId]);
    const r=(await one(tx,"insert into nestful.activity_tasks(family_id,activity_id,title,assignee_member_id,created_by_member_id) values($1,$2,$3,$4,$5) returning *",[familyId,id,input.title.trim(),input.assigneeMemberId??null,actor.id]))!;
    await audit(tx,familyId,actor.id,'activity.task.created','activity_task',r.id);return taskDto(r);
  });},
  async updateTask(familyId:string,id:string,taskId:string,userId:string,status:string,version:number){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),a=await activityRow(tx,familyId,id,true);
    if(!['draft','scheduled'].includes(a.status))throw new DomainError(409,'activity_closed');
    const task=await one(tx,"select * from nestful.activity_tasks where family_id=$1 and activity_id=$2 and id=$3 for update",[familyId,id,assertUuid(taskId)]);
    if(!task)throw new DomainError(404,'task_not_found');
    if(actor.role!=='admin'&&task.assignee_member_id!==actor.id&&task.created_by_member_id!==actor.id)throw new DomainError(403,'forbidden');
    if(!['open','done'].includes(status))throw new DomainError(400,'invalid_status');
    if(task.version!==version)throw new DomainError(409,'version_conflict');
    const r=(await one(tx,"update nestful.activity_tasks set status=$2,completed_at=case when $2='done' then now() end,version=version+1 where id=$1 returning *",[taskId,status]))!;
    await audit(tx,familyId,actor.id,'activity.task.updated','activity_task',taskId);return taskDto(r);
  });},
  async status(familyId:string,id:string,userId:string,status:string,version:number){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),a=await activityRow(tx,familyId,id,true);requireManager(a,actor);
    if(a.version!==version)throw new DomainError(409,'version_conflict');
    if(!['completed','cancelled'].includes(status)||!['draft','scheduled'].includes(a.status))throw new DomainError(409,'invalid_activity_transition');
    const r=(await one(tx,`update nestful.activities set status=$2,version=version+1,updated_at=now(),
      completed_at=case when $2='completed' then now() end,cancelled_at=case when $2='cancelled' then now() end where id=$1 returning *`,[id,status]))!;
    await audit(tx,familyId,actor.id,`activity.${status}`,'activity',id);return activityDto(tx,r);
  });},
};
