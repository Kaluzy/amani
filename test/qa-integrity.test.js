import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('review regressions at real data boundaries', async t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'amani-integrity-'));
  process.env.TRENDSHIFT_DB_PATH = path.join(temp, 'test.db');
  const { default: db, upsertRepo } = await import('../src/lib/database.js');
  const { collect } = await import('../src/lib/catalog.js');
  const { importKnownMetadata } = await import('../scripts/scrape-trending.js');
  const { createApp } = await import('../scripts/serve-api.js');
  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(temp, { recursive: true, force: true }); });
  await t.test('old cache cannot reduce newer counts or replace a known description', async () => {
    upsertRepo({ full_name:'qa/newer', name:'newer', stargazers_count:150, forks_count:15, description:'Current description' });
    const cache = path.join(temp,'cache.json');
    writeFileSync(cache, JSON.stringify({ repos:[{ full_name:'qa/newer', name:'newer', stargazers_count:100, forks_count:10, description:'Old description', topics:['cli'] }] }));
    await importKnownMetadata(cache);
    const row = db.prepare("SELECT * FROM repos WHERE full_name='qa/newer'").get();
    assert.equal(row.stargazers_count,150);
    assert.equal(row.forks_count,15);
    assert.equal(row.description,'Current description');
    assert.equal(row.topics,'["cli"]','unknown metadata can still be enriched');
  });
  await t.test('invalid query periods return a client error instead of successful null', async () => {
    assert.equal((await fetch(origin+'/api/repos?period=unknown')).status,400);
  });
  await t.test('dot-only repository names cannot be saved as suggestions', async () => {
    const response = await fetch(origin+'/api/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repository:'owner/..'})});
    assert.equal(response.status,400);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM submissions WHERE full_name='owner/..'").get().n,0);
  });
  await t.test('malformed growth counts roll back the entire collection', () => {
    assert.throws(() => collect('daily',[{full_name:'qa/bad',name:'bad',stargazers_count:100,forks_count:10,stars_today:'not-a-number'}]),/Invalid/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM repos WHERE full_name='qa/bad'").get().n,0);
  });
  await t.test('stats command exports real SQLite data rather than generated cache history',()=>{
    collect('daily',[{full_name:'qa/db-backed',name:'db-backed',language:'Go',stargazers_count:200,forks_count:20,stars_today:7}]);
    mkdirSync(path.join(temp,'.trendshift/cache'),{recursive:true});
    writeFileSync(path.join(temp,'.trendshift/cache/trending.json'),JSON.stringify({repos:[{full_name:'demo/wrong',name:'wrong',language:'JavaScript',stargazers_count:999,forks_count:99,created_at:'2026-01-01'}]}));
    const script=fileURLToPath(new URL('../scripts/compute-stats.js',import.meta.url));
    const result=spawnSync(process.execPath,[script],{cwd:temp,env:process.env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const exported=JSON.parse(readFileSync(path.join(temp,'.trendshift/cache/stats.json')));
    assert.equal(exported.languages.Go?.totalStars,200,'stats must use the Go repository in SQLite');
    assert.equal(exported.charts.monthlyStars.labels.length,1,'only observed months are exported');
  });
  await t.test('rank command exports collected membership instead of heuristic demo rankings',()=>{
    const script=fileURLToPath(new URL('../scripts/rank-momentum.js',import.meta.url));
    const result=spawnSync(process.execPath,[script],{cwd:temp,env:process.env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const exported=JSON.parse(readFileSync(path.join(temp,'.trendshift/cache/ranked.json')));
    assert.deepEqual(exported.periods.daily.top.map(repo=>repo.full_name),['qa/db-backed']);
    assert.equal(exported.periods.yearly.top.length,0,'annual history cannot be invented');
  });
});
