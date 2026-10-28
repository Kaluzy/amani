import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import puppeteer from 'puppeteer';

test('GitHub Pages export works without a backend under its project base path',{timeout:90000},async t=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'amani-pages-test-'));
  process.env.TRENDSHIFT_DB_PATH=path.join(temp,'private.db');
  const {default:db}=await import('../src/lib/database.js');
  const {collect}=await import('../src/lib/catalog.js');
  for(const period of ['daily','weekly','monthly'])collect(period,[{full_name:'example/pages',description:'A real static export fixture.',language:'JavaScript',topics:['testing'],stargazers_count:1200,forks_count:80,stars_today:20}]);
  db.prepare("INSERT INTO submissions(full_name) VALUES('private/do-not-publish')").run();
  const output=path.join(temp,'dist');const seed=path.join(temp,'seed.json');
  const run=(script,...args)=>{
    const result=spawnSync(process.execPath,[script,...args],{cwd:path.resolve(new URL('..',import.meta.url).pathname),env:{...process.env,PAGES_OUTPUT:output,PAGES_BASE:'/amani',PAGES_SEED:seed},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr||result.stdout);return result.stdout;
  };
  run('scripts/pages-seed.js','export');
  assert.ok(!readFileSync(seed,'utf8').includes('private/do-not-publish'));
  run('scripts/build-pages.js');
  const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
  assert.ok(walk(output).every(file=>!file.endsWith('.db')&&!file.endsWith('.sqlite')));
  assert.ok(!readFileSync(path.join(output,'data/repos.json'),'utf8').includes('private/do-not-publish'));
  const app=express();app.use('/amani',express.static(output));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true});});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const page=await browser.newPage();const errors=[],bad=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
  for(const width of [390,768,1440]){
    await page.setViewport({width,height:1000});
    for(const route of ['/','/daily/','/weekly/','/monthly/','/yearly/','/stats/','/insights/','/topics/','/topics/testing/','/github-trending/','/repositories/example/pages/','/submit/','/about/','/privacy/','/contact/']){
      await page.goto(origin+'/amani'+route,{waitUntil:'networkidle0'});await page.waitForSelector('#mainContent:not([aria-busy])');
      assert.equal(await page.$$eval('.error-state',els=>els.length),0,route);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${route}`);
      assert.ok(await page.$$eval('a[href^="/"]',links=>links.every(link=>link.getAttribute('href').startsWith('/amani/'))),`${route} link escapes project path`);
      if(route==='/stats/')assert.equal(await page.evaluate(()=>Object.keys(Chart.instances).length),4);
      if(route==='/submit/'){assert.equal(await page.$$eval('#submitForm',els=>els.length),0);assert.ok(await page.$('a[href*="github.com/Kaluzy/amani/issues/new"]'));}
    }
  }
  await page.goto(origin+'/amani/weekly/',{waitUntil:'networkidle0'});
  await page.select('#sortSelect','stars');await page.click('#listView');
  assert.match(page.url(),/\/amani\/weekly\//);
  assert.match(await page.$eval('.repo-details-link',el=>el.getAttribute('href')),/^\/amani\/repositories\//);
  await page.click('.repo-details-link');await page.waitForSelector('.detail-heading');
  await page.reload({waitUntil:'networkidle0'});assert.ok(await page.$('.detail-heading'));
  await page.goto(origin+'/amani/',{waitUntil:'networkidle0'});
  await page.type('#globalSearch','pages');await page.$eval('#searchForm',form=>form.requestSubmit());await page.waitForSelector('#sortSelect');
  assert.match(page.url(),/\/amani\/github-trending\?q=pages/);
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
});
