import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer';
import { guides, projectNotes, githubURL } from '../public/editorial.js';
import { freshnessRows } from '../public/reliability.js';
import { assertSourceHealth } from '../scripts/source-health.js';
import { getJSON } from '../public/ui.js';

test('three original guides give fit, limitations, experiments and primary sources', () => {
  assert.equal(guides.length, 3);
  assert.equal(new Set(guides.map(guide => guide.slug)).size, 3);
  for (const guide of guides) {
    assert.equal(guide.steps.length, 3); assert.ok(guide.skip && guide.audience && guide.check);
    for (const name of guide.names) {
      assert.match(githubURL(name), /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
      for (const field of ['role','setup','effort','fit','caution','experiment']) assert.ok(projectNotes[name][field]);
    }
  }
  assert.match(projectNotes['n8n-io/n8n'].caution, /source-available/);
});
test('release health rejects stale, empty, malformed and future collections', () => {
  const now = Date.now();
  const status = () => ({periods:Object.fromEntries(['daily','weekly','monthly'].map(period => [period,{count:5,latest:new Date(now).toISOString()}]))});
  assert.equal(assertSourceHealth(status(), {now}).length, 3);
  for (const patch of [{latest:new Date(now-4*3600000).toISOString()}, {count:0}, {latest:'bad'}, {latest:new Date(now+3600000).toISOString()}]) {
    const data = status(); Object.assign(data.periods.weekly, patch); assert.throws(() => assertSourceHealth(data, {now}));
  }
  const stale = status(); stale.periods.weekly.latest = new Date(now-4*3600000).toISOString();
  assert.equal(freshnessRows(stale, now).find(row => row.period === 'weekly').state, 'delayed');
  assert.equal(freshnessRows({periods:{}}, now)[0].state, 'unavailable');
});
test('browser GET retries one transient response but not a real 404', async t => {
  let calls=0; const server=createServer((req,res)=>{calls++;res.setHeader('Content-Type','application/json');res.statusCode=req.url==='/missing'?404:calls===1?503:200;res.end(JSON.stringify(res.statusCode===200?{ok:true}:{error:'Unavailable'}));}).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));const origin=`http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await getJSON(origin),{ok:true});assert.equal(calls,2);calls=0;await assert.rejects(getJSON(origin+'/missing'),/Unavailable/);assert.equal(calls,1);
  const controller=new AbortController();controller.abort();await assert.rejects(getJSON(origin,controller.signal),{name:'AbortError'});assert.equal(calls,1);
});
test('watchlist handles unknowns, negative changes, tampering and blocked storage', async t => {
  const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  t.after(()=>delete globalThis.localStorage);
  const store=await import('../public/watchlist.js?isolated');
  const repo={full_name:'example/test',stargazers_count:100,forks_count:5,archived:false};
  assert.ok(store.acknowledge([repo]));
  const changes=store.watchChanges([{...repo,stargazers_count:90,forks_count:null,archived:true}],store.readBaseline())[0];
  assert.equal(changes.stars,-10);assert.equal(changes.forks,null);assert.ok(changes.archiveChanged);
  store.forgetBaseline(repo.full_name);assert.deepEqual(store.readBaseline(),{});
  storage.set('amani:watchlist:v1',JSON.stringify({'../escape':{},'example/test':{stars:1,forks:0,checkedAt:'invalid'}}));assert.deepEqual(store.readBaseline(),{});
  localStorage.setItem=()=>{throw new Error('blocked');};assert.equal(store.acknowledge([repo]),false);assert.ok(store.readBaseline()['example/test']);
  store.forgetBaseline();assert.deepEqual(store.readBaseline(),{});
});

test('decision journeys, watchlist and lazy charts work in the real browser', {timeout:120000}, async t => {
  const temp=mkdtempSync(path.join(os.tmpdir(),'amani-usefulness-'));process.env.AMANI_DB_PATH=path.join(temp,'test.sqlite');
  const {default:db}=await import('../src/lib/database.js');const{collect}=await import('../src/lib/catalog.js');const{createApp}=await import('../scripts/serve-api.js');
  const fixtures=[{full_name:'vercel/next.js',stargazers_count:200,forks_count:20,description:'React tools',language:'JavaScript',topics:[],license:'MIT',updated_at:'2026-10-30T00:00:00Z'},{full_name:'example/unknown',stargazers_count:100,forks_count:5,description:'Unknown deployment',language:'Python',topics:[]}];
  for(const period of ['daily','weekly','monthly'])collect(period,fixtures);
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true});});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await t.test('home defers chart library and primary navigation is short and keyboard operable',async()=>{
    await page.setViewport({width:1440,height:1000});const requests=[];page.on('request',request=>requests.push(request.url()));
    await page.evaluateOnNewDocument(()=>{window.testCLS=0;new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.testCLS+=entry.value;}).observe({type:'layout-shift',buffered:true});});
    await page.goto(origin,{waitUntil:'networkidle0'});assert.equal(requests.some(url=>url.includes('/vendor/chart.js')),false);assert.equal(await page.evaluate(()=>Boolean(window.Chart)),false);
    assert.ok(await page.evaluate(()=>window.testCLS<=0.1),'Loading reserves space instead of moving a visible footer');
    assert.equal(await page.$$eval('#mainNav > a',els=>els.length),7);assert.equal(await page.$eval('#moreNavigation',el=>el.open),false);
    await page.focus('#moreNavigation summary');await page.keyboard.press('Enter');assert.equal(await page.$eval('#moreNavigation',el=>el.open),true);
    await page.click('#mainNav a[href="/stats"]');await page.waitForSelector('#languageSort');assert.equal(await page.evaluate(()=>Object.keys(Chart.instances).length),4);
  });
  await t.test('all guides and briefing work at narrow widths; missing catalog entries stay explicit',async()=>{
    for(const width of [320,390,768,1440]){
      await page.setViewport({width,height:1000});
      for(const route of ['/collections',...guides.map(guide=>'/collections/'+guide.slug),'/briefing','/status']){
        await page.goto(origin+route,{waitUntil:'networkidle0'});await page.waitForSelector('#mainContent:not([aria-busy])');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} ${width}px`);
        assert.equal(await page.$$eval('.error-state',els=>els.length),0);
        if(route==='/status'&&width<600)assert.ok(await page.$$eval('.status-table td',els=>els.every(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0)),'Every freshness fact is visible without sideways scrolling');
      }
    }
    await page.goto(origin+'/collections/first-saas',{waitUntil:'networkidle0'});
    assert.match(await page.$eval('main',el=>el.textContent),/Not in the current catalog/);
    await page.click('.decision-project [data-save-repo]');
    await page.click('a[href^="/workbench?compare="]');await page.waitForSelector('.comparison-table');
    assert.match(await page.$eval('.comparison-table',el=>el.textContent),/JavaScript\/React/);
    assert.match(await page.$eval('.comparison-table',el=>el.textContent),/Not the last code commit/);
    assert.equal(await page.$$eval('.comparison-table a[href$="/commits"]',els=>els.length),1);
  });
  await t.test('watchlist persists baselines, shows recorded deltas and allows clearing and unsaving',async()=>{
    await page.click('#watchlistCheckin');assert.match(await page.$eval('#watchlistMessage',el=>el.textContent),/Check-in saved/);
    db.prepare("UPDATE repos SET stargazers_count=207,forks_count=21 WHERE full_name='vercel/next.js'").run();
    await page.reload({waitUntil:'networkidle0'});assert.match(await page.$eval('.watchlist-row',el=>el.textContent),/Stars: \+7/);
    await page.click('#watchlistClear');assert.match(await page.$eval('.watchlist-row',el=>el.textContent),/No baseline/);
    await page.click('#watchlistCheckin');await page.click('.workbench-choice [data-save-repo]');
    assert.equal(await page.$$eval('.watchlist-row',els=>els.length),0);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('amani:watchlist:v1'))),{});
    await page.goto(origin+'/workbench?compare=example/unknown',{waitUntil:'networkidle0'});assert.match(await page.$eval('.comparison-table',el=>el.textContent),/Not reviewed/);
    assert.equal(await page.$$eval('.watchlist-panel',els=>els.length),0,'shared comparison does not silently enable monitoring');
    assert.deepEqual(errors,[]);
  });
});
