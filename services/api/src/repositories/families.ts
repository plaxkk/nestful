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
const invitationDto = (r:Record<string,any>) => ({id:r.id as string,familyId:r.family_id as string,role:"member" as const,
  createdByMemberId:r.created_by_member_id as string,createdAt:iso(r.created_at)!,expiresAt:iso(r.expires_at),
  canceledAt:iso(r.canceled_at),acceptedAt:iso(r.accepted_at),acceptedByMemberId:r.accepted_by_member_id as string|undefined,
  status:r.accepted_at?"accepted":r.canceled_at?"canceled":new Date(r.expires_at).getTime()<Date.now()?"expired":"active"});

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
      if(status==='inactive')await tx.query("update nestful.notification_deliveries set status='canceled',updated_at=now() where family_id=$1 and member_id=$2 and status='pending'",[familyId,memberId]);
      await audit(tx,familyId,actor.id,"member.updated","member",memberId);
      return memberDto(updated);
    });
  },
  async invite(familyId:string,userId:string,expiresAt?:string) {
    return transaction(async tx=>{
      const actor=await activeMember(tx,familyId,userId,true),code=randomBytes(24).toString('base64url');
      const expiry=expiresAt??new Date(Date.now()+24*60*60*1000).toISOString();
      if(!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now())throw new DomainError(400,"invalid_expires_at");
      const row=(await one(tx,"insert into nestful.family_invitations(family_id,code_hash,created_by_member_id,expires_at) values($1,$2,$3,$4) returning *",[familyId,hash(code),actor.id,expiry]))!;
      await audit(tx,familyId,actor.id,"invitation.created","invitation",row.id);
      return {...invitationDto(row),code,joinPath:`/pages/join/index?code=${code}`};
    });
  },
  async invitations(familyId:string,userId:string) {
    return transaction(async tx=>{await activeMember(tx,familyId,userId,true);return (await tx.query("select * from nestful.family_invitations where family_id=$1 order by created_at desc,id limit 100",[familyId])).rows.map(invitationDto);});
  },
  async cancelInvitation(familyId:string,id:string,userId:string) {
    return transaction(async tx=>{
      const actor=await activeMember(tx,familyId,userId,true);
      const row=await one(tx,"update nestful.family_invitations set canceled_at=now() where family_id=$1 and id=$2 and accepted_at is null returning *",[familyId,assertUuid(id)]);
      if(!row)throw new DomainError(409,"invitation_unavailable");
      await audit(tx,familyId,actor.id,"invitation.canceled","invitation",id);return invitationDto(row);
    });
  },
  async invitation(code:string) {
    const r=(await query(`select i.*,f.name family_name from nestful.family_invitations i join nestful.families f on f.id=i.family_id
      where i.code_hash=$1 and f.archived_at is null`,[hash(code)]))[0];
    if(!r)throw new DomainError(404,"invitation_not_found");
    // A bearer invite only exposes the minimum join preview, never members/private records.
    return {familyName:r.family_name as string,status:invitationDto(r).status,expiresAt:iso(r.expires_at)};
  },
  async accept(code:string,userId:string,displayName:string) {
    if(!displayName.trim())throw new DomainError(400,"display_name_required");
    return transaction(async tx=>{
      const i=await one(tx,"select * from nestful.family_invitations where code_hash=$1 for update",[hash(code)]);
      if(!i)throw new DomainError(404,"invitation_not_found");
      if(i.accepted_at){
        const m=await one(tx,"select * from nestful.family_members where id=$1 and user_id=$2 and status='active'",[i.accepted_by_member_id,userId]);
        if(m)return {member:memberDto(m),invitation:invitationDto(i)};
      }
      if(i.accepted_at||i.canceled_at||new Date(i.expires_at).getTime()<=Date.now())throw new DomainError(409,"invitation_unavailable");
      const f=await one(tx,"select * from nestful.families where id=$1 and archived_at is null for update",[i.family_id]);
      if(!f)throw new DomainError(404,"family_not_found");
      const member=(await one(tx,`insert into nestful.family_members(family_id,user_id,display_name) values($1,$2,$3)
        on conflict(family_id,user_id) do update set status='active',role=case when nestful.family_members.status='active' then nestful.family_members.role else 'member' end,
        version=nestful.family_members.version+1,updated_at=now() returning *`,[i.family_id,assertUuid(userId),displayName.trim()]))!;
      const accepted=(await one(tx,"update nestful.family_invitations set accepted_at=now(),accepted_by_member_id=$2 where id=$1 returning *",[i.id,member.id]))!;
      await audit(tx,i.family_id,member.id,"invitation.accepted","member",member.id);
      return {family:familyDto(f),member:memberDto(member),invitation:invitationDto(accepted)};
    });
  },
};
