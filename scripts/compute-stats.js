// Export recorded database statistics; never synthesize missing history.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listRepos } from '../src/lib/catalog.js';
import { chartData } from '../src/lib/chart-data.js';
import db from '../src/lib/database.js';

async function main(){
  const repos=listRepos('all');
  const languages={};
  for(const repo of repos){
    const language=repo.language||'Unspecified';
    const row=languages[language]||={repos:0,totalStars:0,totalForks:0,avgStars:0,knownRepos:0};
    row.repos++;
    if(repo.stargazers_count!=null){row.totalStars+=repo.stargazers_count;row.totalForks+=repo.forks_count||0;row.knownRepos++;}
  }
  for(const row of Object.values(languages))row.avgStars=row.knownRepos?Math.round(row.totalStars/row.knownRepos):null;
  const charts={monthlyStars:chartData('month','stars'),monthlyForks:chartData('month','forks'),yearlyStars:chartData('year','stars'),yearlyForks:chartData('year','forks')};
  const directory=path.resolve('.trendshift/cache');await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,'stats.json'),JSON.stringify({languages,charts,metadata:{source:'sqlite-observations',computed_at:new Date().toISOString(),total_repos:repos.length}},null,2));
  console.log(`Exported observed statistics for ${repos.length} repositories`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.close());
