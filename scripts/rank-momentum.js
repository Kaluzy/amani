// Export actual collected rankings. Yearly requires verified multi-day history.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listRepos, periods } from '../src/lib/catalog.js';
import db from '../src/lib/database.js';

async function main(){
  const rankings=Object.fromEntries(periods.map(period=>{
    const repos=listRepos(period);
    return [period,{period,total:repos.length,top:repos.slice(0,25),source:period==='yearly'?'observed-growth':'github-trending'}];
  }));
  const directory=path.resolve('.trendshift/cache');await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,'ranked.json'),JSON.stringify({periods:rankings,metadata:{source:'sqlite-observations',ranked_at:new Date().toISOString(),periods}},null,2));
  console.log('Exported latest recorded period rankings');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.close());
