import { DomainError } from "./db.js";

export interface Schedule {
  timesOfDay?:string[]; birthdayDate?:string; birthdayCalendar?:'solar'|'lunar'; birthdayLeapMonth?:boolean;
  advanceDays?:number; notifyOnDay?:boolean; targetLabel?:string; frequencyLabel?:string;
  notificationTemplateId?:string;
}
const formatterCache=new Map<string,Intl.DateTimeFormat>();
const formatter=(timezone:string)=>{
  let f=formatterCache.get(timezone);
  if(!f){try{f=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}catch{throw new DomainError(400,'invalid_timezone');}formatterCache.set(timezone,f);}
  return f;
};
export const localParts=(instant:string|Date,timezone:string)=>{
  const p=Object.fromEntries(formatter(timezone).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
  return {year:Number(p.year),month:Number(p.month),day:Number(p.day),hour:Number(p.hour),minute:Number(p.minute),second:Number(p.second)};
};
type Parts=ReturnType<typeof localParts>;
const stamp=(p:Parts)=>Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
export const localInstant=(p:Parts,timezone:string)=>{
  const desired=stamp(p),candidates:number[]=[];
  // Try offsets around both sides of a DST transition; choose the earlier fold.
  for(const delta of [-86400000,0,86400000]){
    const probe=desired+delta,offset=stamp(localParts(new Date(probe),timezone))-probe;
    const candidate=desired-offset;
    if(stamp(localParts(new Date(candidate),timezone))===desired)candidates.push(candidate);
  }
  if(!candidates.length)throw new DomainError(400,'nonexistent_local_time');
  return new Date(Math.min(...candidates)).toISOString();
};
const dayPlus=(p:Parts,days:number)=>{
  const d=new Date(Date.UTC(p.year,p.month-1,p.day+days));
  return {...p,year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};
};
export const shiftLocalDays=(instant:string,days:number,timezone:string)=>localInstant(dayPlus(localParts(instant,timezone),days),timezone);

export const validateSchedule=(raw:Schedule|undefined,frequency:string,type:string,timezone:string):Schedule=>{
  formatter(timezone);const s={...raw};
  if(!['once','daily_once','daily_twice','daily_three_times','weekly','monthly','yearly'].includes(frequency))throw new DomainError(400,'invalid_frequency');
  if(s.timesOfDay!==undefined&&(!Array.isArray(s.timesOfDay)||s.timesOfDay.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))))throw new DomainError(400,'invalid_schedule_times');
  s.timesOfDay=[...new Set(s.timesOfDay??[])].sort();
  const required:Record<string,number>={daily_once:1,daily_twice:2,daily_three_times:3};
  if(required[frequency]&&s.timesOfDay.length!==required[frequency])throw new DomainError(400,'invalid_schedule_times');
  if(s.advanceDays!==undefined&&(!Number.isInteger(s.advanceDays)||s.advanceDays<0||s.advanceDays>30))throw new DomainError(400,'invalid_advance_days');
  if(s.notifyOnDay!==undefined&&typeof s.notifyOnDay!=='boolean')throw new DomainError(400,'invalid_schedule');
  if(s.birthdayLeapMonth!==undefined&&typeof s.birthdayLeapMonth!=='boolean')throw new DomainError(400,'invalid_schedule');
  for(const label of [s.targetLabel,s.frequencyLabel])if(label!==undefined&&(typeof label!=='string'||label.length>100))throw new DomainError(400,'invalid_schedule');
  if(s.birthdayCalendar!==undefined&&!['solar','lunar'].includes(s.birthdayCalendar))throw new DomainError(400,'invalid_calendar');
  if(type==='birthday'){
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s.birthdayDate??'');
    if(!match)throw new DomainError(400,'birthday_date_required');
    const month=Number(match[2]),day=Number(match[3]);
    if(month<1||month>12||day<1||day>(s.birthdayCalendar==='lunar'?30:31))throw new DomainError(400,'invalid_birthday');
    if(s.birthdayCalendar!=='lunar'){
      const d=new Date(Date.UTC(2000,month-1,day));if(d.getUTCMonth()!==month-1)throw new DomainError(400,'invalid_birthday');
    }
    if(!(s.advanceDays??0)&&s.notifyOnDay===false)throw new DomainError(400,'no_birthday_notification');
    s.birthdayCalendar??='solar';s.notifyOnDay??=true;
  }
  return s;
};
const chinese=new Intl.DateTimeFormat('en-US-u-ca-chinese',{timeZone:'UTC',year:'numeric',month:'numeric',day:'numeric'});
if(chinese.resolvedOptions().calendar!=='chinese')throw new Error('Chinese calendar ICU support is required');
export const nextBirthday=(after:string,s:Schedule,timezone:string,inclusive=false)=>{
  const [,m,d]=s.birthdayDate!.split('-'),month=Number(m),day=Number(d),p=localParts(after,timezone);
  // Leap lunar months recur irregularly. Search actual calendar dates, never approximate as Gregorian.
  for(let offset=0;offset<=3660;offset++){
    const date=dayPlus(p,offset);
    if(date.year<1900||date.year>2100)throw new DomainError(400,'calendar_date_out_of_range');
    let matches=date.month===month&&date.day===day;
    if(s.birthdayCalendar==='lunar'){
      const parts=Object.fromEntries(chinese.formatToParts(new Date(Date.UTC(date.year,date.month-1,date.day,12))).map(x=>[x.type,x.value]));
      matches=parseInt(parts.month,10)===month&&Number(parts.day)===day&&parts.month.includes('bis')===Boolean(s.birthdayLeapMonth);
    }
    if(matches){const candidate=localInstant({...date,hour:p.hour,minute:p.minute,second:0},timezone);
      if(inclusive?candidate>=after:candidate>after)return candidate;}
  }
  throw new DomainError(400,'birthday_date_unresolvable');
};
export const nextOccurrence=(current:string,frequency:string,s:Schedule,timezone:string,startsAt:string):string|undefined=>{
  if(frequency==='once')return undefined;
  if(s.birthdayDate)return nextBirthday(current,s,timezone);
  const p=localParts(current,timezone),anchor=localParts(startsAt,timezone);
  if(frequency.startsWith('daily_')){
    for(let day=0;day<=1;day++)for(const time of s.timesOfDay??[]){
      const [hour,minute]=time.split(':').map(Number),candidate=localInstant({...dayPlus(p,day),hour,minute,second:0},timezone);
      if(candidate>current)return candidate;
    }
    throw new DomainError(400,'invalid_schedule_times');
  }
  if(frequency==='weekly')return shiftLocalDays(current,7,timezone);
  let year=p.year,month=p.month;
  if(frequency==='monthly'){month++;if(month===13){month=1;year++;}}
  else year++;
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  return localInstant({...anchor,year,month,day:Math.min(anchor.day,lastDay)},timezone);
};
