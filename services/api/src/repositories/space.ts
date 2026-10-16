import { transaction, one, audit, DomainError, iso, assertUuid, type Transaction } from "../db.js";
import { activeMember, requireActiveMembers } from "./families.js";
import { pageWindow,pageResult,type PageInput } from "./pagination.js";

const warning='账号说明只能记录用途、归属和找回线索，不要保存密码、验证码、密保答案或恢复密钥。';
const dto=async(tx:Transaction,r:Record<string,any>)=>{
  const tagged=(await tx.query("select member_id from nestful.space_item_members where family_id=$1 and item_id=$2 order by member_id",[r.family_id,r.id])).rows;
  const media=(await tx.query("select * from nestful.space_item_media where family_id=$1 and item_id=$2 order by position,id",[r.family_id,r.id])).rows;
  return {id:r.id as string,familyId:r.family_id as string,kind:r.kind as string,title:r.title as string,summary:r.summary as string|undefined,url:r.url as string|undefined,
    occurredAt:iso(r.occurred_at),place:r.place as string|undefined,activityId:r.source_activity_id as string|undefined,
    createdByMemberId:r.created_by_member_id as string,version:r.version as number,createdAt:iso(r.created_at)!,
    taggedMemberIds:tagged.map(m=>m.member_id as string),securityWarning:r.kind==='account'?warning:undefined,
    mediaItems:media.map(m=>({id:m.id as string,kind:m.kind as string,label:m.label as string|undefined,url:m.url as string|undefined,
      mimeType:m.mime_type as string|undefined,sizeBytes:m.size_bytes===null?undefined:Number(m.size_bytes),createdAt:iso(m.created_at)}))};
};
interface SpaceInput {kind:string;title:string;summary?:string;url?:string;occurredAt?:string;place?:string;taggedMemberIds?:string[];mediaItems?:Array<{kind:string;label?:string;url?:string;mimeType?:string;sizeBytes?:number}>}
const validateUrl=(url:string|undefined)=>{
  if(!url)return;
  try{if(!['https:','http:'].includes(new URL(url).protocol))throw new Error();}catch{throw new DomainError(400,'invalid_url');}
};
const create=async(tx:Transaction,familyId:string,actor:Record<string,any>,input:SpaceInput,sourceId?:string)=>{
  if(!['document','account','memory'].includes(input.kind)||!input.title.trim())throw new DomainError(400,'invalid_space_item');
  if(input.occurredAt&&!Number.isFinite(Date.parse(input.occurredAt)))throw new DomainError(400,'invalid_date');
  validateUrl(input.url);
  const tags=await requireActiveMembers(tx,familyId,input.taggedMemberIds??[]);
  const row=(await one(tx,`insert into nestful.space_items(family_id,kind,title,summary,url,occurred_at,place,created_by_member_id,source_activity_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[familyId,input.kind,input.title.trim(),input.summary??null,input.url??null,input.occurredAt??null,input.place??null,actor.id,sourceId??null]))!;
  for(const id of tags)await tx.query("insert into nestful.space_item_members(family_id,item_id,member_id) values($1,$2,$3)",[familyId,row.id,id]);
  for(const [position,m] of (input.mediaItems??[]).entries()){
    validateUrl(m.url);
    if(m.sizeBytes!==undefined&&(!Number.isSafeInteger(m.sizeBytes)||m.sizeBytes<1))throw new DomainError(400,'invalid_size');
    await tx.query(`insert into nestful.space_item_media(family_id,item_id,kind,label,url,mime_type,size_bytes,position)
      values($1,$2,$3,$4,$5,$6,$7,$8)`,[familyId,row.id,m.kind,m.label??null,m.url??null,m.mimeType??null,m.sizeBytes??null,position]);
  }
  await audit(tx,familyId,actor.id,'space.item.created','space_item',row.id);return dto(tx,row);
};
export const spaceRepository={
  async list(familyId:string,userId:string,input:PageInput&{kind?:string}={}){return transaction(async tx=>{
    await activeMember(tx,familyId,userId);const {limit,after}=pageWindow(input);
    const rows=(await tx.query(`select * from nestful.space_items where family_id=$1 and archived_at is null and ($2::text is null or kind=$2)
      and ($3::timestamptz is null or (created_at,id)<($3::timestamptz,$4::uuid)) order by created_at desc,id desc limit $5`,[familyId,input.kind??null,after?.time??null,after?.id??null,limit+1])).rows;
    const data=[];for(const row of rows)data.push(await dto(tx,row));return pageResult(data,limit,r=>r.createdAt);
  });},
  async create(familyId:string,userId:string,input:SpaceInput){return transaction(async tx=>create(tx,familyId,await activeMember(tx,familyId,userId),input));},
  async saveActivityMemory(familyId:string,activityId:string,userId:string){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId);
    const a=await one(tx,"select * from nestful.activities where family_id=$1 and id=$2 and archived_at is null for update",[familyId,assertUuid(activityId)]);
    if(!a)throw new DomainError(404,'activity_not_found');
    if(actor.role!=='admin'&&a.created_by_member_id!==actor.id)throw new DomainError(403,'forbidden');
    if(a.status!=='completed')throw new DomainError(409,'activity_not_completed');
    const existing=await one(tx,"select * from nestful.space_items where source_activity_id=$1",[activityId]);
    if(existing)return dto(tx,existing);
    const participants=(await tx.query(`select p.member_id from nestful.activity_participants p join nestful.family_members m on m.id=p.member_id
      where p.family_id=$1 and p.activity_id=$2 and p.rsvp='accepted' and m.status='active'`,[familyId,activityId])).rows;
    return create(tx,familyId,actor,{kind:'memory',title:a.title,summary:a.description??undefined,occurredAt:iso(a.starts_at),place:a.location??undefined,
      taggedMemberIds:participants.map(p=>p.member_id)},activityId);
  });},
};
