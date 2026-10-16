import { transaction,one,audit,DomainError,iso,assertUuid,type Transaction } from "../db.js";
import { activeMember,requireActiveMembers } from "./families.js";
import { createPlanInTransaction } from "./reminders.js";
import { nextOccurrence } from "../reminder-schedule.js";
import { pageWindow,pageResult,type PageInput } from "./pagination.js";

type Row=Record<string,any>;
const categories=['daily','education','health','travel','housing','subscription','other'];
const money=(value:unknown,positive=true):number=>{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<(positive?1:0))throw new DomainError(400,'invalid_amount');return value;
};
const sum=(a:number,b:number)=>{const n=a+b;if(!Number.isSafeInteger(n))throw new DomainError(409,'summary_amount_overflow');return n;};
interface EntryInput {type:string;category:string;title:string;amountCents:number;paidByMemberId:string;splitMemberIds?:string[];occurredAt:string;recurrence?:string}
const entryDto=async(tx:Transaction,r:Row)=>{
  const splits=(await tx.query("select member_id,amount_cents from nestful.ledger_entry_splits where family_id=$1 and entry_id=$2 order by member_id",[r.family_id,r.id])).rows;
  return {id:r.id as string,familyId:r.family_id as string,type:r.type as 'income'|'expense',category:r.category as string,title:r.title as string,
    amountCents:Number(r.amount_cents),paidByMemberId:r.paid_by_member_id as string,createdByMemberId:r.created_by_member_id as string,
    splitMemberIds:splits.map(s=>s.member_id as string),splits:splits.map(s=>({memberId:s.member_id as string,amountCents:Number(s.amount_cents)})),
    occurredAt:iso(r.occurred_at)!,createdAt:iso(r.created_at)!,recurrence:r.recurrence as string|undefined,recurringReminderId:r.recurring_plan_id as string|undefined,
    version:r.version as number,voidedAt:iso(r.voided_at)};
};
const goalDto=(r:Row)=>({id:r.id as string,familyId:r.family_id as string,title:r.title as string,targetAmountCents:Number(r.target_amount_cents),currentAmountCents:Number(r.current_amount_cents),
  createdByMemberId:r.created_by_member_id as string,dueAt:iso(r.due_at),createdAt:iso(r.created_at)!,completedAt:iso(r.completed_at),version:r.version as number});
const splitsFor=async(tx:Transaction,familyId:string,entryId:string,input:EntryInput)=>{
  if(input.type!=='expense')return;
  const ids=(await requireActiveMembers(tx,familyId,input.splitMemberIds?.length?input.splitMemberIds:[input.paidByMemberId])).sort();
  const base=Math.floor(input.amountCents/ids.length),remainder=input.amountCents%ids.length;
  for(const [i,id] of ids.entries())await tx.query("insert into nestful.ledger_entry_splits(family_id,entry_id,member_id,amount_cents) values($1,$2,$3,$4)",[familyId,entryId,id,base+(i<remainder?1:0)]);
};
const validate=(i:EntryInput)=>{
  money(i.amountCents);
  if(!['income','expense'].includes(i.type)||!categories.includes(i.category)||!i.title.trim()||!Number.isFinite(Date.parse(i.occurredAt)))throw new DomainError(400,'invalid_ledger_entry');
  if(i.recurrence&&!['monthly','yearly'].includes(i.recurrence))throw new DomainError(400,'invalid_recurrence');
};
const authorize=(row:Row,actor:Row)=>{if(actor.role!=='admin'&&row.created_by_member_id!==actor.id)throw new DomainError(403,'forbidden');};

export const ledgerRepository={
  async entries(familyId:string,userId:string,input:PageInput={}){return transaction(async tx=>{
    await activeMember(tx,familyId,userId);const {limit,after}=pageWindow(input);
    const rows=(await tx.query(`select * from nestful.ledger_entries where family_id=$1 and voided_at is null
      and ($2::timestamptz is null or (occurred_at,id)<($2::timestamptz,$3::uuid)) order by occurred_at desc,id desc limit $4`,[familyId,after?.time??null,after?.id??null,limit+1])).rows;
    const data=[];for(const r of rows)data.push(await entryDto(tx,r));return pageResult(data,limit,r=>r.occurredAt);
  });},
  async createEntry(familyId:string,userId:string,input:EntryInput){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId);validate(input);await requireActiveMembers(tx,familyId,[input.paidByMemberId]);
    const r=(await one(tx,`insert into nestful.ledger_entries(family_id,type,category,title,amount_cents,paid_by_member_id,created_by_member_id,occurred_at,recurrence)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[familyId,input.type,input.category,input.title.trim(),input.amountCents,input.paidByMemberId,actor.id,input.occurredAt,input.recurrence??null]))!;
    await splitsFor(tx,familyId,r.id,input);
    if(input.recurrence){
      const f=(await one(tx,"select timezone from nestful.families where id=$1",[familyId]))!;
      const due=nextOccurrence(new Date(input.occurredAt).toISOString(),input.recurrence,{},f.timezone,new Date(input.occurredAt).toISOString())!;
      const {plan}=await createPlanInTransaction(tx,familyId,actor,{type:'bill',title:`${input.title}续费`,dueAt:due,frequency:input.recurrence,targetScope:'member',targetMemberIds:[input.paidByMemberId],assigneeMemberId:input.paidByMemberId});
      await tx.query("update nestful.ledger_entries set recurring_plan_id=$2 where id=$1",[r.id,plan.id]);r.recurring_plan_id=plan.id;
    }
    await audit(tx,familyId,actor.id,'ledger.entry.created','ledger_entry',r.id);return entryDto(tx,r);
  });},
  async updateEntry(familyId:string,id:string,userId:string,input:EntryInput&{version:number}){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),r=await one(tx,"select * from nestful.ledger_entries where family_id=$1 and id=$2 and voided_at is null for update",[familyId,assertUuid(id)]);
    if(!r)throw new DomainError(404,'entry_not_found');authorize(r,actor);if(r.version!==input.version)throw new DomainError(409,'version_conflict');
    validate(input);await requireActiveMembers(tx,familyId,[input.paidByMemberId]);
    // Editing the accounting record must not silently rewrite a separately managed reminder plan.
    if((input.recurrence??null)!==r.recurrence)throw new DomainError(400,'edit_recurrence_via_plan');
    const updated=(await one(tx,`update nestful.ledger_entries set type=$3,category=$4,title=$5,amount_cents=$6,paid_by_member_id=$7,occurred_at=$8,
      version=version+1,updated_at=now() where family_id=$1 and id=$2 returning *`,[familyId,id,input.type,input.category,input.title.trim(),input.amountCents,input.paidByMemberId,input.occurredAt]))!;
    await tx.query("delete from nestful.ledger_entry_splits where entry_id=$1",[id]);await splitsFor(tx,familyId,id,input);
    await audit(tx,familyId,actor.id,'ledger.entry.updated','ledger_entry',id);return entryDto(tx,updated);
  });},
  async voidEntry(familyId:string,id:string,userId:string,version:number){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),r=await one(tx,"select * from nestful.ledger_entries where family_id=$1 and id=$2 for update",[familyId,assertUuid(id)]);
    if(!r)throw new DomainError(404,'entry_not_found');authorize(r,actor);if(r.version!==version)throw new DomainError(409,'version_conflict');
    await tx.query("update nestful.ledger_entries set voided_at=now(),version=version+1,updated_at=now() where id=$1",[id]);
    await audit(tx,familyId,actor.id,'ledger.entry.voided','ledger_entry',id);return {id,version:version+1};
  });},
  async goals(familyId:string,userId:string,input:PageInput={}){return transaction(async tx=>{
    await activeMember(tx,familyId,userId);const {limit,after}=pageWindow(input);
    const rows=(await tx.query(`select * from nestful.ledger_goal_funds where family_id=$1 and archived_at is null
      and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid)) order by created_at desc,id desc limit $4`,[familyId,after?.time??null,after?.id??null,limit+1])).rows;
    return pageResult(rows.map(goalDto),limit,r=>r.createdAt);
  });},
  async createGoal(familyId:string,userId:string,input:{title:string;targetAmountCents:number;currentAmountCents?:number;dueAt?:string}){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId);money(input.targetAmountCents);money(input.currentAmountCents??0,false);
    if(!input.title.trim()||(input.dueAt&&!Number.isFinite(Date.parse(input.dueAt))))throw new DomainError(400,'invalid_goal');
    const r=(await one(tx,`insert into nestful.ledger_goal_funds(family_id,title,target_amount_cents,current_amount_cents,created_by_member_id,due_at,completed_at)
      values($1,$2,$3,$4,$5,$6,case when $4::bigint >= $3::bigint then now() end) returning *`,[familyId,input.title.trim(),input.targetAmountCents,input.currentAmountCents??0,actor.id,input.dueAt??null]))!;
    await audit(tx,familyId,actor.id,'ledger.goal.created','ledger_goal',r.id);return goalDto(r);
  });},
  async updateGoal(familyId:string,id:string,userId:string,input:{version:number;title:string;targetAmountCents:number;currentAmountCents:number;dueAt?:string}){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId),r=await one(tx,"select * from nestful.ledger_goal_funds where family_id=$1 and id=$2 and archived_at is null for update",[familyId,assertUuid(id)]);
    if(!r)throw new DomainError(404,'goal_not_found');authorize(r,actor);if(r.version!==input.version)throw new DomainError(409,'version_conflict');
    money(input.targetAmountCents);money(input.currentAmountCents,false);
    if(!input.title.trim()||(input.dueAt&&!Number.isFinite(Date.parse(input.dueAt))))throw new DomainError(400,'invalid_goal');
    const updated=(await one(tx,`update nestful.ledger_goal_funds set title=$3,target_amount_cents=$4,current_amount_cents=$5,due_at=$6,
      completed_at=case when $5::bigint >= $4::bigint then coalesce(completed_at,now()) end,version=version+1,updated_at=now()
      where family_id=$1 and id=$2 returning *`,[familyId,id,input.title.trim(),input.targetAmountCents,input.currentAmountCents,input.dueAt??null]))!;
    await audit(tx,familyId,actor.id,'ledger.goal.updated','ledger_goal',id);return goalDto(updated);
  });},
  async summary(familyId:string,userId:string,month?:string){return transaction(async tx=>{
    await activeMember(tx,familyId,userId);
    const f=(await one(tx,"select timezone,to_char(now() at time zone timezone,'YYYY-MM') as month_key from nestful.families where id=$1",[familyId]))!;
    const period=month??f.month_key;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new DomainError(400,'invalid_month');
    const entries=(await tx.query(`select * from nestful.ledger_entries where family_id=$1 and voided_at is null
      and occurred_at >= ($2::date::timestamp at time zone $3) and occurred_at < (($2::date+interval '1 month')::timestamp at time zone $3)`,[familyId,`${period}-01`,f.timezone])).rows;
    const categories=new Map<string,{category:string;amountCents:number;entryCount:number}>();
    const members=new Map<string,{memberId:string;paidCents:number;owedCents:number;balanceCents:number;entryCount:number}>();
    const member=(id:string)=>{if(!members.has(id))members.set(id,{memberId:id,paidCents:0,owedCents:0,balanceCents:0,entryCount:0});return members.get(id)!;};
    let income=0,expense=0;
    for(const r of entries){const amount=Number(r.amount_cents);
      if(r.type==='income'){income=sum(income,amount);continue;}expense=sum(expense,amount);
      const c=categories.get(r.category)??{category:r.category,amountCents:0,entryCount:0};c.amountCents=sum(c.amountCents,amount);c.entryCount++;categories.set(r.category,c);
      const payer=member(r.paid_by_member_id);payer.paidCents=sum(payer.paidCents,amount);payer.entryCount++;
      const splits=(await tx.query("select member_id,amount_cents from nestful.ledger_entry_splits where entry_id=$1",[r.id])).rows;
      for(const split of splits){const m=member(split.member_id);m.owedCents=sum(m.owedCents,Number(split.amount_cents));if(m.memberId!==payer.memberId)m.entryCount++;}
    }
    const goals=(await tx.query("select * from nestful.ledger_goal_funds where family_id=$1 and archived_at is null order by created_at desc limit 100",[familyId])).rows.map(goalDto);
    return {familyId,month:period,incomeCents:income,expenseCents:expense,balanceCents:sum(income,-expense),entryCount:entries.length,
      categoryTotals:[...categories.values()],memberSplits:[...members.values()].map(m=>({...m,balanceCents:sum(m.paidCents,-m.owedCents)})),goalFunds:goals};
  });},
};
