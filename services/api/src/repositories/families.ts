import { createHash, randomBytes } from "node:crypto";
import { transaction, query, one, audit, DomainError, iso, assertUuid, type Transaction } from "../db.js";

const hash = (s:string) => createHash("sha256").update(s).digest("hex");
export const familyDto = (r:Record<string,any>) => ({id:r.id as string,name:r.name as string,
  ownerUserId:r.created_by_user_id as string,timezone:r.timezone as string,version:r.version as number,createdAt:iso(r.created_at)!});
export const memberDto = (r:Record<string,any>, sensitive=false) => ({id:r.id as string,familyId:r.family_id as string,
  userId:r.user_id as string,displayName:r.display_name as string,role:r.role as "admin"|"member",
  identityTag:r.identity_tag as string|undefined,status:r.status as string,version:r.version as number,
  birthday:r.birthday_month ? `${r.birthday_year ?? "0000"}-${String(r.birthday_month).padStart(2,"0")}-${String(r.birthday_day).padStart(2,"0")}` : undefined,
  birthdayCalendar:r.birthday_calendar as "solar"|"lunar",birthdayLeapMonth:r.birthday_leap_month as boolean,
  location:r.location as string|undefined,joinedAt:iso(r.joined_at),
  ...(sensitive ? {emergencyContact:r.emergency_contact as string|undefined,privateNotes:r.notes as string|undefined}:{}),
});

export const activeMember = async (tx:Transaction,familyId:string,userId:string,admin=false) => {
  const r = await one(tx,`select m.* from nestful.family_members m join nestful.families f on f.id=m.family_id
    where m.family_id=$1 and m.user_id=$2 and m.status='active' and f.archived_at is null`,[assertUuid(familyId),assertUuid(userId)]);
  if (!r || (admin && r.role!=="admin")) throw new DomainError(403,"forbidden");
  return r;
};
export const requireActiveMembers=async(tx:Transaction,familyId:string,ids:string[])=>{
  const distinct=[...new Set(ids.map(assertUuid))];
  const rows=(await tx.query("select id from nestful.family_members where family_id=$1 and id=any($2::uuid[]) and status='active'",[familyId,distinct])).rows;
  if(rows.length!==distinct.length)throw new DomainError(400,'invalid_family_member');return distinct;
};
const invitationStatus = (r:Record<string,any>) => r.canceled_at?'canceled':
  r.mode!=='group'&&r.accepted_at?'accepted':new Date(r.expires_at).getTime()<=Date.now()?'expired':
  r.mode==='group'&&r.use_count>=r.max_uses?'full':'active';
const invitationDto = (r:Record<string,any>) => ({id:r.id as string,familyId:r.family_id as string,role:"member" as const,
  mode:r.mode as 'single'|'group',maxUses:r.max_uses as number,useCount:r.use_count as number,requiresApproval:r.requires_approval as boolean,
  createdByMemberId:r.created_by_member_id as string,createdAt:iso(r.created_at)!,expiresAt:iso(r.expires_at),
  canceledAt:iso(r.canceled_at),acceptedAt:iso(r.accepted_at),acceptedByMemberId:r.accepted_by_member_id as string|undefined,
  status:invitationStatus(r)});

const lockedInvitation=async(tx:Transaction,code:string)=>{
  const found=await one(tx,'select family_id from nestful.family_invitations where code_hash=$1',[hash(code)]);
  if(!found)throw new DomainError(404,'invitation_not_found');
  const family=await one(tx,'select * from nestful.families where id=$1 and archived_at is null for update',[found.family_id]);
  if(!family)throw new DomainError(409,'invitation_unavailable');
  const invitation=(await one(tx,'select * from nestful.family_invitations where code_hash=$1 for update',[hash(code)]))!;
  return {family,invitation};
};
const joinRequestDto=(r:Record<string,any>)=>({id:r.id as string,displayName:r.display_name as string,
  status:r.status as 'pending'|'approved'|'rejected',createdAt:iso(r.created_at),available:invitationStatus(r)==='active'});
const admit=async(tx:Transaction,f:Record<string,any>,i:Record<string,any>,userId:string,displayName:string)=>{
  const member=(await one(tx,`insert into nestful.family_members(family_id,user_id,display_name) values($1,$2,$3)
    on conflict(family_id,user_id) do update set status='active',role='member',display_name=$3,
    version=nestful.family_members.version+1,updated_at=now() returning *`,[f.id,assertUuid(userId),displayName]))!;
  if(i.mode==='group')await tx.query('update nestful.family_invitations set use_count=use_count+1 where id=$1',[i.id]);
  else await tx.query('update nestful.family_invitations set accepted_at=now(),accepted_by_member_id=$2,use_count=1 where id=$1',[i.id,member.id]);
  await audit(tx,f.id,member.id,'invitation.accepted','member',member.id);
  return member;
};

export const familyRepository = {
  async create(userId:string,input:{name:string;ownerDisplayName:string}) {
    if (!input.name.trim()||input.name.length>100||!input.ownerDisplayName.trim()) throw new DomainError(400,"invalid_family");
    return transaction(async tx=>{
      // Depend on RETURNING rows rather than rereading sibling CTE writes.
      // Family, first admin and audit stay atomic, with one database round trip.
      const row=(await one(tx,`with family as (
        insert into nestful.families(name,created_by_user_id) values($1,$2) returning *
      ), member as (
        insert into nestful.family_members(family_id,user_id,display_name,role)
        select id,$2,$3,'admin' from family returning *
      ), audited as (
        insert into nestful.audit_events(family_id,actor_user_id,actor_member_id,action,resource_type,resource_id)
        select family.id,$2,member.id,'family.created','family',family.id from family cross join member
        returning id
      ) select to_jsonb(family) as family,to_jsonb(member) as member from family cross join member`,
        [input.name.trim(),assertUuid(userId),input.ownerDisplayName.trim()]))!;
      return {family:familyDto(row.family),ownerMember:memberDto(row.member)};
    });
  },
  async memberships(userId:string) {
    return transaction(async tx=>{
      const rows=(await tx.query(`select f.*,m.id member_id from nestful.families f join nestful.family_members m on m.family_id=f.id
        where m.user_id=$1 and m.status='active' and f.archived_at is null order by m.joined_at desc limit 100`,[assertUuid(userId)])).rows;
      if(!rows.length)return [];
      const members=(await tx.query("select * from nestful.family_members where family_id=any($1::uuid[]) and status='active' order by joined_at,id",[rows.map(f=>f.id)])).rows;
      return rows.map(f=>{
        const familyMembers=members.filter(m=>m.family_id===f.id);
        return {family:familyDto(f),member:memberDto(familyMembers.find(m=>m.id===f.member_id)!),members:familyMembers.map(m=>memberDto(m))};
      });
    });
  },
  async get(familyId:string,userId:string) {
    return transaction(async tx=>{await activeMember(tx,familyId,userId);return familyDto((await one(tx,"select * from nestful.families where id=$1",[familyId]))!);});
  },
  async rename(familyId:string,userId:string,name:string,version:number){return transaction(async tx=>{
    const f=await one(tx,'select * from nestful.families where id=$1 for update',[assertUuid(familyId)]);
    const actor=await activeMember(tx,familyId,userId,true);
    if(!name.trim()||name.trim().length>100)throw new DomainError(400,'invalid_family');
    if(f!.version!==version)throw new DomainError(409,'version_conflict');
    const updated=(await one(tx,'update nestful.families set name=$2,version=version+1,updated_at=now() where id=$1 returning *',[familyId,name.trim()]))!;
    await audit(tx,familyId,actor.id,'family.renamed','family',familyId);return familyDto(updated);
  });},
  async members(familyId:string,userId:string) {
    return transaction(async tx=>{await activeMember(tx,familyId,userId);return (await tx.query("select * from nestful.family_members where family_id=$1 and status='active' order by joined_at,id",[familyId])).rows.map(r=>memberDto(r));});
  },
  async member(familyId:string,memberId:string,userId:string) {
    return transaction(async tx=>{
      const actor=await activeMember(tx,familyId,userId);
      const sensitive=actor.id===memberId||actor.role==='admin';
      const row=await one(tx,`select m.*${sensitive?",p.emergency_contact,p.notes":""} from nestful.family_members m
        ${sensitive?"left join nestful.member_private_profiles p on p.member_id=m.id":""}
        where m.family_id=$1 and m.id=$2`,[familyId,assertUuid(memberId)]);
      if(!row)throw new DomainError(404,"member_not_found");return memberDto(row,sensitive);
    });
  },
  async updateMember(familyId:string,memberId:string,userId:string,input:Record<string,unknown>) {
    return transaction(async tx=>{
      // Serialize membership lifecycle changes, including simultaneous admin exits.
      await tx.query("select id from nestful.families where id=$1 for update",[assertUuid(familyId)]);
      const actor=await activeMember(tx,familyId,userId);
      if(actor.id!==memberId&&actor.role!=='admin')throw new DomainError(403,"forbidden");
      const r=await one(tx,"select * from nestful.family_members where family_id=$1 and id=$2 for update",[familyId,assertUuid(memberId)]);
      if(!r)throw new DomainError(404,"member_not_found");
      if(input.version!==r.version)throw new DomainError(409,"version_conflict");
      if((input.role!==undefined||input.status!==undefined)&&actor.role!=='admin'&&!(actor.id===memberId&&input.status==='inactive'&&input.role===undefined))throw new DomainError(403,"forbidden");
      const role=input.role??r.role,status=input.status??r.status,tag=Object.prototype.hasOwnProperty.call(input,'identityTag')?input.identityTag:r.identity_tag;
      if(!['admin','member'].includes(String(role))||!['active','inactive'].includes(String(status))||(tag&&!['elder','child','guest'].includes(String(tag))))throw new DomainError(400,"invalid_member");
      let year=r.birthday_year,month=r.birthday_month,day=r.birthday_day;
      if(input.birthday!==undefined){
        if(input.birthday===''){year=month=day=null;}
        else {const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input.birthday));if(!match)throw new DomainError(400,"invalid_birthday");
          year=Number(match[1])||null;month=Number(match[2]);day=Number(match[3]);}
      }
      const calendar=input.birthdayCalendar??r.birthday_calendar;
      if(!['solar','lunar'].includes(String(calendar)))throw new DomainError(400,"invalid_birthday");
      if(month&&calendar==='solar'){
        const d=new Date(Date.UTC(year??2000,month-1,day));
        if(d.getUTCMonth()!==month-1||d.getUTCDate()!==day)throw new DomainError(400,"invalid_birthday");
      }
      const updated=(await one(tx,`update nestful.family_members set display_name=$3,role=$4,status=$5,identity_tag=$6,
        birthday_year=$7,birthday_month=$8,birthday_day=$9,birthday_calendar=$10,birthday_leap_month=$11,
        location=$12,version=version+1,updated_at=now() where family_id=$1 and id=$2 returning *`,
        [familyId,memberId,input.displayName??r.display_name,role,status,tag,year,month,day,calendar,
          input.birthdayLeapMonth??r.birthday_leap_month,input.location??r.location]))!;
      if(input.emergencyContact!==undefined||input.privateNotes!==undefined){
        await tx.query(`insert into nestful.member_private_profiles(family_id,member_id,emergency_contact,notes) values($1,$2,$3,$4)
          on conflict(member_id) do update set emergency_contact=coalesce($3,nestful.member_private_profiles.emergency_contact),
          notes=coalesce($4,nestful.member_private_profiles.notes),updated_at=now()`,[familyId,memberId,input.emergencyContact??null,input.privateNotes??null]);
      }
      if(status==='inactive'){
        await tx.query("update nestful.notification_deliveries set status='canceled',updated_at=now() where family_id=$1 and member_id=$2 and status in ('pending','skipped','processing')",[familyId,memberId]);
      }
      if(status==='inactive'||role!=='admin')await tx.query("update nestful.family_invitations set canceled_at=now() where family_id=$1 and created_by_member_id=$2 and accepted_at is null and canceled_at is null",[familyId,memberId]);
      await audit(tx,familyId,actor.id,"member.updated","member",memberId);
      return memberDto(updated);
    });
  },
  async invite(familyId:string,userId:string,expiresAt?:string,options:{mode?:string;maxUses?:number;requiresApproval?:boolean}={}) {
    return transaction(async tx=>{
      await tx.query('select id from nestful.families where id=$1 for update',[assertUuid(familyId)]);
      const actor=await activeMember(tx,familyId,userId,true),code=randomBytes(24).toString('base64url');
      const mode=options.mode??'single',maxUses=mode==='group'?(options.maxUses??20):1,approval=mode==='group'?(options.requiresApproval??true):false;
      if(!['single','group'].includes(mode)||!Number.isInteger(maxUses)||maxUses<1||maxUses>100||typeof approval!=='boolean')throw new DomainError(400,'invalid_invitation');
      const expiry=expiresAt??new Date(Date.now()+(mode==='group'?7:1)*86400000).toISOString();
      if(!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now()||Date.parse(expiry)>Date.now()+7*86400000+1000)throw new DomainError(400,"invalid_expires_at");
      const row=(await one(tx,"insert into nestful.family_invitations(family_id,code_hash,created_by_member_id,expires_at,mode,max_uses,requires_approval) values($1,$2,$3,$4,$5,$6,$7) returning *",[familyId,hash(code),actor.id,expiry,mode,maxUses,approval]))!;
      await audit(tx,familyId,actor.id,"invitation.created","invitation",row.id);
      return {...invitationDto(row),code,joinPath:`/pages/join/index?code=${code}`};
    });
  },
  async invitations(familyId:string,userId:string) {
    return transaction(async tx=>{await activeMember(tx,familyId,userId,true);return (await tx.query("select * from nestful.family_invitations where family_id=$1 order by created_at desc,id limit 100",[familyId])).rows.map(invitationDto);});
  },
  async cancelInvitation(familyId:string,id:string,userId:string) {
    return transaction(async tx=>{
      await tx.query('select id from nestful.families where id=$1 for update',[assertUuid(familyId)]);
      const actor=await activeMember(tx,familyId,userId,true);
      const row=await one(tx,"update nestful.family_invitations set canceled_at=coalesce(canceled_at,now()) where family_id=$1 and id=$2 and accepted_at is null returning *",[familyId,assertUuid(id)]);
      if(!row)throw new DomainError(409,"invitation_unavailable");
      await audit(tx,familyId,actor.id,"invitation.canceled","invitation",id);return invitationDto(row);
    });
  },
  async invitation(code:string) {
    const r=(await query(`select i.*,f.name family_name from nestful.family_invitations i join nestful.families f on f.id=i.family_id
      where i.code_hash=$1 and f.archived_at is null`,[hash(code)]))[0];
    if(!r)throw new DomainError(404,"invitation_not_found");
    // A bearer invite only exposes the minimum join preview, never members/private records.
    return {familyName:r.family_name as string,status:invitationDto(r).status,expiresAt:iso(r.expires_at),mode:r.mode,requiresApproval:r.requires_approval};
  },
  async accept(code:string,userId:string,displayName:string) {
    if(!displayName.trim()||displayName.trim().length>60)throw new DomainError(400,"display_name_required");
    return transaction(async tx=>{
      const {family:f,invitation:i}=await lockedInvitation(tx,code);
      const existing=await one(tx,"select * from nestful.family_members where family_id=$1 and user_id=$2 and status='active'",[f.id,assertUuid(userId)]);
      if(existing)return {status:'joined' as const,family:familyDto(f),member:memberDto(existing),invitation:invitationDto(i)};
      if(invitationStatus(i)!=='active')throw new DomainError(409,'invitation_unavailable');
      const creator=await one(tx,"select id from nestful.family_members where id=$1 and status='active' and role='admin'",[i.created_by_member_id]);
      if(!creator)throw new DomainError(409,'invitation_unavailable');
      const previous=await one(tx,'select * from nestful.family_join_requests where invitation_id=$1 and user_id=$2 for update',[i.id,userId]);
      if(previous?.status==='rejected'||previous?.status==='approved')throw new DomainError(409,'invitation_unavailable');
      if(i.requires_approval){
        const request=previous??(await one(tx,'insert into nestful.family_join_requests(family_id,invitation_id,user_id,display_name) values($1,$2,$3,$4) returning *',[f.id,i.id,userId,displayName.trim()]))!;
        return {status:'pending' as const,requestId:request.id as string,familyName:f.name as string};
      }
      const member=await admit(tx,f,i,userId,displayName.trim());
      await tx.query("insert into nestful.family_join_requests(family_id,invitation_id,user_id,display_name,status,decided_at) values($1,$2,$3,$4,'approved',now())",[f.id,i.id,userId,displayName.trim()]);
      const accepted=(await one(tx,'select * from nestful.family_invitations where id=$1',[i.id]))!;
      return {status:'joined' as const,family:familyDto(f),member:memberDto(member),invitation:invitationDto(accepted)};
    });
  },
  async joinStatus(code:string,userId:string){return transaction(async tx=>{
    const i=await one(tx,`select i.*,to_jsonb(f) family from nestful.family_invitations i
      join nestful.families f on f.id=i.family_id where code_hash=$1 and f.archived_at is null`,[hash(code)]);
    if(!i)throw new DomainError(404,'invitation_not_found');
    const member=await one(tx,"select * from nestful.family_members where family_id=$1 and user_id=$2 and status='active'",[i.family_id,userId]);
    if(member)return {status:'joined' as const,family:familyDto(i.family),member:memberDto(member)};
    const request=await one(tx,'select status from nestful.family_join_requests where invitation_id=$1 and user_id=$2',[i.id,userId]);
    return {status:invitationStatus(i)!=='active'?'unavailable':request?.status==='approved'?'unavailable':request?.status??'new'};
  });},
  async joinRequests(familyId:string,userId:string){return transaction(async tx=>{
    await activeMember(tx,familyId,userId,true);
    return (await tx.query(`select r.*,i.mode,i.use_count,i.max_uses,i.canceled_at,i.accepted_at,i.expires_at
      from nestful.family_join_requests r join nestful.family_invitations i on i.id=r.invitation_id
      where r.family_id=$1 and r.status='pending' order by r.created_at,r.id limit 100`,[familyId])).rows.map(joinRequestDto);
  });},
  async decideJoin(familyId:string,id:string,userId:string,decision:string){return transaction(async tx=>{
    const f=await one(tx,'select * from nestful.families where id=$1 for update',[assertUuid(familyId)]);
    const actor=await activeMember(tx,familyId,userId,true);
    const request=await one(tx,'select * from nestful.family_join_requests where family_id=$1 and id=$2 for update',[familyId,assertUuid(id)]);
    if(!request)throw new DomainError(404,'request_not_found');
    if(!['approved','rejected'].includes(decision))throw new DomainError(400,'invalid_decision');
    if(request.status!=='pending')throw new DomainError(409,'request_already_decided');
    const i=(await one(tx,'select * from nestful.family_invitations where id=$1 for update',[request.invitation_id]))!;
    if(decision==='approved'){
      if(invitationStatus(i)!=='active')throw new DomainError(409,'invitation_unavailable');
      const existing=await one(tx,"select id from nestful.family_members where family_id=$1 and user_id=$2 and status='active'",[familyId,request.user_id]);
      if(!existing)await admit(tx,f!,i,request.user_id,request.display_name);
    }
    await tx.query('update nestful.family_join_requests set status=$2,decided_at=now(),decided_by_member_id=$3 where id=$1',[id,decision,actor.id]);
    await audit(tx,familyId,actor.id,`invitation.request.${decision}`,'join_request',id);
    return {id,status:decision};
  });},
  async archive(familyId:string,userId:string,version:number){return transaction(async tx=>{
    const f=await one(tx,'select * from nestful.families where id=$1 for update',[assertUuid(familyId)]);
    const actor=await activeMember(tx,familyId,userId,true);
    if(f!.version!==version)throw new DomainError(409,'version_conflict');
    await tx.query('update nestful.families set archived_at=now(),updated_at=now(),version=version+1 where id=$1',[familyId]);
    await tx.query('update nestful.family_invitations set canceled_at=now() where family_id=$1 and accepted_at is null and canceled_at is null',[familyId]);
    await tx.query('update nestful.reminder_plans set enabled=false,next_generation_at=null where family_id=$1',[familyId]);
    await tx.query("update nestful.notification_deliveries set status='canceled' where family_id=$1 and status in ('pending','skipped','processing')",[familyId]);
    await audit(tx,familyId,actor.id,'family.archived','family',familyId);
    return {id:familyId,archived:true};
  });},
};
