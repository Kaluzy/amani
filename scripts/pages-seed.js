// Only allowlisted PUBLIC repository metadata and verified observations are exported.
// Never copy workspace SQLite files, suggestions, GitHub events or credentials.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import db,{upsertRepo} from '../src/lib/database.js';
import '../src/lib/catalog.js';
import { validatePublicSeed } from '../src/lib/public-seed.js';
import { exportPublicSeed } from '../src/lib/public-data.js';

const file=path.resolve(process.env.PAGES_SEED || 'data/public-seed.json');
try{
  if(process.argv[2]==='export'){
    const seed=await exportPublicSeed(file);
    console.log(`Exported allowlisted public seed: ${seed.repositories.length} repositories`);
  }else if(process.argv[2]==='import'){
    if(db.prepare('SELECT COUNT(*) n FROM repos').get().n){console.log('Keeping existing public Pages observations');}
    else{
      let seed=JSON.parse(await readFile(file,'utf8'));
      if(process.env.PAGES_SEED_URL){
        try{
          const response=await fetch(process.env.PAGES_SEED_URL,{signal:AbortSignal.timeout(20000)});
          if(response.ok){const published=await response.json();seed=validatePublicSeed(published);}
        }catch{console.log('Published seed unavailable; using the checked-in public seed');}
      }
      validatePublicSeed(seed);
      db.transaction(()=>{
        const ids=new Map();for(const repo of seed.repositories) ids.set(repo.full_name,upsertRepo(repo));
        const insert=db.prepare("INSERT INTO star_history(repo_id,timestamp,stars,forks,watchers,open_issues,source) VALUES(?,?,?,?,?,0,'github-cache')");
        for(const [name,history] of Object.entries(seed.history))for(const row of history)insert.run(ids.get(name),row.timestamp,row.stars,row.forks,row.watchers??0);
        for(const [period,collection] of Object.entries(seed.collections)){
          if(!collection.items.length)continue;
          const run=db.prepare("INSERT INTO collection_runs(period,source,collected_at) VALUES(?,'github-trending',?)").run(period,collection.collected_at).lastInsertRowid;
          for(const item of collection.items)db.prepare('INSERT INTO collection_entries(run_id,repo_id,rank,stars_gained) VALUES(?,?,?,?)').run(run,ids.get(item.full_name),item.rank,item.stars_gained);
        }
      })();console.log(`Imported public seed with original observation timestamps`);
    }
  }else throw new Error('Use pages-seed.js export or import');
}finally{db.close();}
