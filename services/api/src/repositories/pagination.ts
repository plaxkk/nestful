import { DomainError, uuid } from "../db.js";

export interface PageInput { limit?:number; cursor?:string }
export const pageWindow=(input:PageInput={})=>{
  const limit=input.limit??50;
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new DomainError(400,'invalid_limit');
  let after:{time:string;id:string}|undefined;
  if(input.cursor){
    try{
      const decoded=JSON.parse(Buffer.from(input.cursor,'base64url').toString());
      if(typeof decoded.time!=='string'||!Number.isFinite(Date.parse(decoded.time))||!uuid(decoded.id))throw new Error();
      after=decoded;
    }catch{throw new DomainError(400,'invalid_cursor');}
  }
  return {limit,after};
};
export const pageResult=<T extends {id:string}>(rows:T[],limit:number,time:(r:T)=>string)=>{
  const data=rows.slice(0,limit),last=data.at(-1);
  return {data,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify({time:time(last),id:last.id})).toString('base64url'):undefined};
};
