import { execFileSync,spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const run=(env)=>spawnSync(process.platform==='win32'?'corepack.cmd':'corepack',['pnpm','--filter','@nestful/api','exec','tsx','--test','test/relational-v2.test.ts'],{stdio:'inherit',env}).status??1;
if(process.env.NESTFUL_TEST_ADMIN_URL){process.exitCode=run(process.env);}
else{
  const folder=mkdtempSync(join(tmpdir(),'nestful-pg-tests-')),data=join(folder,'data');
  const binary=name=>process.env.POSTGRES_BIN_DIR?join(process.env.POSTGRES_BIN_DIR,name):name;
  let started=false;
  try{
    const server=createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
    const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    execFileSync(binary('initdb'),['-D',data,'-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
    execFileSync(binary('pg_ctl'),['-D',data,'-l',join(folder,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${folder}`,'-w','start'],{stdio:'pipe'});started=true;
    process.exitCode=run({...process.env,NESTFUL_TEST_ADMIN_URL:`postgresql://127.0.0.1:${port}/postgres`});
  }finally{
    if(started)execFileSync(binary('pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});
    rmSync(folder,{recursive:true,force:true});
  }
}
