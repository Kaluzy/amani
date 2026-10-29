import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { validatePublicSeed } from '../src/lib/public-seed.js';
import { freshnessNotice } from '../public/ui.js';

const seed = () => ({schema:1,repositories:[{full_name:'example/tool',topics:['tools'],stargazers_count:0,forks_count:0}],history:{'example/tool':[{timestamp:'2026-10-28 03:00:00',stars:0,forks:0,watchers:0}]},collections:{daily:{collected_at:'2026-10-28 03:00:00',items:[{full_name:'example/tool',rank:1,stars_gained:0}]}}});
test('public recovery seed rejects corrupted counts, paths, topics, timestamps and memberships',()=>{
  assert.equal(validatePublicSeed(seed()).repositories[0].stargazers_count,0);
  for(const mutate of [
    data=>{data.repositories[0].full_name='../escape';},
    data=>{data.repositories[0].stargazers_count=-1;},
    data=>{data.repositories[0].description={unsafe:'not text'};},
    data=>{data.repositories[0].created_at='not-a-date';},
    data=>{data.repositories[0].topics=['../../escape'];},
    data=>{data.history['example/tool'][0].timestamp='not-a-date';},
    data=>{data.history['unknown/tool']=[];},
    data=>{data.collections.daily.items[0].rank=2;},
    data=>{data.collections.daily.items[0].stars_gained=1.2;},
    data=>{data.repositories.push({...data.repositories[0]});},
  ]){const data=seed();mutate(data);assert.throws(()=>validatePublicSeed(data),/Invalid/);}
});
test('shipping metadata is Amani-specific and unused mock algorithms are absent',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.name,'amani-field-guide');assert.match(pkg.description,/independent/);
  assert.ok(!pkg.devDependencies?.vitest);assert.ok(!pkg.dependencies['date-fns']);
  assert.equal(existsSync(new URL('../src/lib/stats.js',import.meta.url)),false);
  assert.equal(existsSync(new URL('../src/lib/momentum.js',import.meta.url)),false);
  assert.match(readFileSync(new URL('../public/shell.html',import.meta.url),'utf8'),/Content-Security-Policy/);
});
test('stale published observations produce a warning rather than a live-data claim',()=>{
  assert.equal(freshnessNotice({periods:{daily:{latest:new Date().toISOString()}}}),'');
  assert.match(freshnessNotice({periods:{daily:{latest:new Date(Date.now()-4*3600000).toISOString()}}}),/three hours old/);
});
test('browser-only saved names are bounded, validated, and usable when persistence is blocked',async t=>{
  const values=new Map();globalThis.window={dispatchEvent:()=>{}};globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  t.after(()=>{delete globalThis.localStorage;delete globalThis.window;});
  const store=await import('../public/shortlist.js?bounded');
  for(let i=0;i<24;i++)assert.ok(store.setSaved('example/tool-'+i,true).ok);
  assert.equal(store.setSaved('example/overflow',true).ok,false);
  assert.equal(store.setSaved('../escape',true).ok,false);
  assert.ok(store.setSaved('example/tool-0',false).ok);
  assert.ok(store.setSaved('example/another',true).ok);
  assert.equal(store.savedNames().length,24);
  values.clear();localStorage.setItem=()=>{throw new Error('Quota exceeded');};
  const blocked=await import('../public/shortlist.js?blocked');
  assert.ok(blocked.setSaved('example/private-shortlist',true).ok);
  assert.deepEqual(blocked.savedNames(),['example/private-shortlist']);
  assert.equal(blocked.storageIsPersistent(),false);
});
test('all repositories stay connected beyond the old 1000-row default cap',async t=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'amani-catalog-release-'));
  process.env.AMANI_DB_PATH=path.join(temp,'db.sqlite');
  const {default:db}=await import('../src/lib/database.js');
  const {createApp}=await import('../scripts/serve-api.js');
  db.transaction(()=>{for(let i=0;i<1002;i++)db.prepare("INSERT INTO repos(full_name,owner,name) VALUES(?,?,?)").run('example/tool-'+i,'example','tool-'+i);})();
  db.prepare("UPDATE repos SET language='ZeroLang' WHERE full_name='example/tool-0'").run();
  db.prepare("UPDATE repos SET language='UnknownLang' WHERE full_name='example/tool-1'").run();
  db.prepare("INSERT INTO star_history(repo_id,timestamp,stars,forks,watchers,open_issues,source) SELECT id,datetime('now'),0,0,0,0,'github' FROM repos WHERE full_name='example/tool-0'").run();
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true});});
  const origin=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await(await fetch(origin+'/api/repos')).json()).length,1002);
  assert.equal((await(await fetch(origin+'/api/repos?limit=10')).json()).length,10);
  const languages=await(await fetch(origin+'/api/stats/languages')).json();
  assert.equal(languages.find(row=>row.language==='ZeroLang').totalStars,0);
  assert.equal(languages.find(row=>row.language==='ZeroLang').avgStars,0);
  assert.equal(languages.find(row=>row.language==='UnknownLang').totalStars,null);
});
