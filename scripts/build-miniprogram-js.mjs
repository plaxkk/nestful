import { execFileSync } from 'node:child_process';
import { mkdtempSync,readdirSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,relative,resolve } from 'node:path';

const root=resolve('apps/miniprogram');
const output=mkdtempSync(join(tmpdir(),'nestful-js-'));
const check=process.argv.includes('--check');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&e.name!=='node_modules'?walk(join(dir,e.name)):e.isFile()?[join(dir,e.name)]:[]);
try{
  execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--project',root,'--noEmit','false','--outDir',output],{stdio:'inherit'});
  const sources=walk(root).filter(p=>p.endsWith('.ts')&&!p.endsWith('.d.ts'));
  const stale=[];
  for(const source of sources){
    const target=source.replace(/\.ts$/,'.js'),generated=readFileSync(join(output,relative(root,target)),'utf8');
    let existing;try{existing=readFileSync(target,'utf8');}catch{}
    if(generated===existing)continue;
    if(check)stale.push(relative(root,target));else writeFileSync(target,generated);
  }
  if(stale.length)throw new Error(`Generated mini-program JS is stale: ${stale.join(', ')}. Run npm run miniprogram:build.`);
  console.log(check?'mini-program JS matches TypeScript':'mini-program JS generated from TypeScript');
}finally{rmSync(output,{recursive:true,force:true});}
