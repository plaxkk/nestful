import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(new URL('../services/api/package.json',import.meta.url));
const {Pool}=require('pg');
const [credentials,output]=process.argv.slice(2);
if(!credentials||!output)throw new Error('Usage: node scripts/backup-relational-state.mjs <private-env-file> <private-output-file>');
const destination=resolve(output);
if(!destination.startsWith(resolve('.data/private-backups')+'/'))throw new Error('Backup must stay in ignored .data/private-backups');
process.loadEnvFile(resolve(credentials));
let endpoint;
try{endpoint=new URL(process.env.DATABASE_URL);}catch{throw new Error('Invalid private database configuration');}
if(endpoint.hostname!=='aws-1-us-west-2.pooler.supabase.com'||endpoint.username!=='postgres.qrspwgrkxogbpvrdafnn')throw new Error('Unexpected database project');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
let client;
try{
  client=await pool.connect();
  await client.query('begin isolation level repeatable read read only');
  const tables=(await client.query("select table_name from information_schema.tables where table_schema='nestful' and table_type='BASE TABLE' order by table_name")).rows;
  const data={};
  for(const {table_name:name} of tables){if(!/^[a-z_]+$/.test(name))throw new Error('Invalid table name');data[name]=(await client.query(`select * from nestful.${name}`)).rows;}
  await client.query('commit');
  await mkdir(resolve('.data/private-backups'),{recursive:true,mode:0o700});
  await writeFile(destination,JSON.stringify({project:'qrspwgrkxogbpvrdafnn',createdAt:new Date().toISOString(),tables:data}),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({backup:destination,tableCount:tables.length,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length]))}));
}catch(error){await client?.query('rollback').catch(()=>{});console.error('Backup failed; no credentials or row contents logged. Code:',error.code??'backup_error');process.exitCode=1;}
finally{client?.release();await pool.end();}
