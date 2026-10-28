import { mkdir, writeFile, rename, readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function checkWebsite(baseURL='http://127.0.0.1:3002',{timeoutMs=5000,retryDelayMs=500}={}) {
  const checks=[];
  async function request(route,validate) {
    for(let attempt=0;attempt<6;attempt++) {
    try {
      const response=await fetch(new URL(route,baseURL),{signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      const detail=validate(data);
      checks.push({name:route,status:'pass',detail:detail||'Response verified'});
      return data;
    }catch(error){
      const code=error.cause?.code;
      if(attempt<5&&['ECONNREFUSED','ECONNRESET','UND_ERR_SOCKET'].includes(code)){
        await new Promise(resolve=>setTimeout(resolve,retryDelayMs));continue;
      }
      checks.push({name:route,status:'fail',detail:error.message+(code?` (${code})`:'')});return null;
    }
    }
  }
  await request('/health',data=>{if(data.status!=='ok')throw new Error('Website is not healthy');});
  const coverage=await request('/api/status',data=>{
    for(const period of ['daily','weekly','monthly']) {
      const row=data.periods?.[period];
      if(!row||row.count<1)throw new Error(`No ${period} collection`);
      const timestamp=Date.parse(row.latest?.includes('T')?row.latest:row.latest?.replace(' ','T')+'Z');
      if(!Number.isFinite(timestamp)||Date.now()-timestamp>6*3600000)throw new Error(`${period} collection is missing or over six hours old`);
    }
    return 'Daily/weekly/monthly populated and fresh; empty yearly history is allowed';
  });
  await request('/api/stats/charts',data=>{
    for(const key of ['monthlyStars','monthlyForks','yearlyStars','yearlyForks'])if(!Array.isArray(data[key]?.labels)||!Array.isArray(data[key]?.datasets))throw new Error(`Invalid ${key} chart`);
  });
  for(const route of ['/api/topics','/api/repos/daily','/api/repos/weekly','/api/repos/monthly','/api/insights'])await request(route,data=>{
    if(route==='/api/insights'){if(!Array.isArray(data.most_starred))throw new Error('Insights are malformed');}
    else if(!Array.isArray(data))throw new Error('Expected a collection');
  });
  return {ok:checks.every(check=>check.status==='pass'),checkedAt:new Date().toISOString(),checks,coverage:coverage?.periods||null};
}

async function regressions() {
  const files=(await readdir(path.join(root,'test'))).filter(file=>file.endsWith('.test.js')).sort();
  return new Promise(resolve=>{
    const child=spawn(process.execPath,['--test',...files.map(file=>'test/'+file)],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
    let output='';
    const collect=chunk=>{output=(output+chunk.toString()).slice(-20000);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    const timeout=setTimeout(()=>child.kill('SIGTERM'),200000);
    child.on('error',error=>{clearTimeout(timeout);resolve({ok:false,output:error.message});});
    child.on('close',code=>{clearTimeout(timeout);resolve({ok:code===0,exitCode:code,output});});
  });
}
async function main(){
  const result=await checkWebsite(process.env.AMANI_QA_URL||'http://127.0.0.1:3002');
  if(process.argv.includes('--full')){result.regressions=await regressions();result.ok=result.ok&&result.regressions.ok;}
  const directory=process.env.AMANI_QA_DIR||path.join(root,'.trendshift/qa');
  await mkdir(directory,{recursive:true,mode:0o700});
  const previous=await readFile(path.join(directory,'latest.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(previous)await writeFile(path.join(directory,'previous.json'),previous,{mode:0o600});
  for(const name of ['latest.json']){
    const target=path.join(directory,name);
    await writeFile(target+'.tmp',JSON.stringify(result,null,2)+'\n',{mode:0o600});await rename(target+'.tmp',target);
  }
  console.log(JSON.stringify({ok:result.ok,checkedAt:result.checkedAt,checks:result.checks,regressions:result.regressions?.ok,report:path.join(directory,'latest.json')},null,2));
  process.exitCode=result.ok?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error);process.exitCode=1;});
