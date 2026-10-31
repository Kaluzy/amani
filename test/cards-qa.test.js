import test from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { card, getJSON } from '../public/ui.js';

const description = 'A repository with an unusually detailed description, explaining its purpose, intended users, integration options, supported workflows, and practical limitations so developers can make an informed decision before opening its documentation. It includes examples for analytics, automation, and collaboration.';
const repo={id:1,full_name:'example/clarity',owner:{login:'example'},name:'clarity',description,language:'TypeScript',topics:['developer-tools'],stargazers_count:1234567,forks_count:12345,stars_gained:250,rank:4,snapshot_at:'2026-10-28 02:25:00'};
test('card names each statistic, shows exact counts, and explains the gain period',()=>{
  const $=cheerio.load(card(repo,0,'weekly'));
  assert.equal($('[data-metric="stars"] dt').clone().find('.stat-symbol').remove().end().text(),'Total stars');
  assert.match($('.repo-card').text(),/1,234,567/);
  assert.match($('.repo-card').text(),/12,345/);
  assert.match($('.repo-card').text(),/Stars gained this week/);
  assert.match($('.repo-card').text(),/Weekly rank #4/);
  assert.match($('.repo-card').text(),/Language/);
});
test('unranked collections do not invent a trending rank',()=>{
  const $=cheerio.load(card({...repo,rank:undefined,stars_gained:null},0,'all'));
  assert.equal($('.repo-rank').length,0);
  assert.match($('.repo-card').text(),/Not recorded/);
});
test('a hung data request exits loading with an actionable timeout',async t=>{
  const server=createServer((req,res)=>setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end('{}');},80)).listen(0,'127.0.0.1');
  await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  await assert.rejects(getJSON(`http://127.0.0.1:${server.address().port}`,undefined,{timeoutMs:20}),/timed out/i);
});
test('QA cards and navigation work in the real browser',{timeout:90000},async t=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'amani-card-browser-'));
  process.env.AMANI_DB_PATH=path.join(temp,'db.sqlite');
  const {default:db}=await import('../src/lib/database.js');
  const {collect}=await import('../src/lib/catalog.js');
  const {createApp}=await import('../scripts/serve-api.js');
  const varied=[repo,{...repo,id:2,full_name:'obra/superpowers',description:'A short description.',topics:[],rank:1},{...repo,id:3,full_name:'another-maintainer/a-long-repository-name-that-wraps',description:'A medium description. '.repeat(6),topics:['automation','testing','development','workflow'],rank:2}];
  for(const period of ['daily','weekly','monthly']) collect(period,varied);
  const server=createApp().listen(0,'127.0.0.1'); await once(server,'listening');
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true});});
  const origin=`http://127.0.0.1:${server.address().port}`;
  await t.test('card sections align across columns with unequal names, descriptions and topics',async()=>{
    const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
    for(const period of ['daily','weekly','monthly']){
      await page.goto(origin+'/'+period,{waitUntil:'networkidle0'});
      const positions=await page.$$eval('.repo-card',cards=>cards.map(card=>Object.fromEntries(['.repo-identity','.repo-description','.repo-language-row','.repo-stats','.repo-growth','.repo-actions'].map(selector=>[selector,card.querySelector(selector).getBoundingClientRect().top]))));
      for(const selector of Object.keys(positions[0])) assert.ok(Math.max(...positions.map(p=>p[selector]))-Math.min(...positions.map(p=>p[selector]))<=1,`${period} ${selector} must align: ${JSON.stringify(positions)}`);
    }
    await page.close();
  });
  await t.test('semantic accents, contrast and selected sort emphasis are distinct',async()=>{
    const page=await browser.newPage();
    await page.goto(origin+'/weekly',{waitUntil:'networkidle0'});
    const accents=await page.evaluate(()=>{
      const style=selector=>getComputedStyle(document.querySelector(selector));
      const ratio=(foreground,background)=>{
        const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
        const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      };
      return ['stars','forks'].map(metric=>{
        const box=style(`.repo-stats [data-metric="${metric}"]`);
        const text=style(`.repo-stats [data-metric="${metric}"] dd`);
        return {color:text.color,contrast:ratio(text.color,box.backgroundColor)};
      });
    });
    assert.notEqual(accents[0].color,accents[1].color);
    for(const accent of accents) assert.ok(accent.contrast>=4.5,JSON.stringify(accent));
    for(const sort of ['stars','forks','velocity','rank','new']){
      await page.select('#sortSelect',sort);
      assert.equal(await page.$eval('#repoGrid',el=>el.dataset.sort),sort);
      assert.equal(await page.$eval('label[for="sortSelect"]',el=>el.dataset.sort),sort);
      assert.match(await page.$eval('#sortCaption',el=>el.textContent),/Ordered by/);
      if(['stars','forks'].includes(sort)) assert.notEqual(await page.$eval(`.repo-stats [data-metric="${sort}"]`,el=>getComputedStyle(el).boxShadow),'none');
    }
    await page.select('#sortSelect','stars');
    await page.reload({waitUntil:'networkidle0'});
    assert.equal(await page.$eval('#sortSelect',el=>el.value),'stars');
    assert.equal(await page.$eval('#repoGrid',el=>el.dataset.sort),'stars');
    await page.goto(origin+'/repositories/example/clarity',{waitUntil:'networkidle0'});
    assert.equal(await page.$$eval('.metrics [data-metric="stars"],.metrics [data-metric="forks"]',els=>els.length),2);
    await page.close();
  });
  await t.test('full descriptions and labeled statistics stay readable on small screens',async()=>{
    for(const width of [320,360,390,600,700,768,900,1024,1220,1280,1440,1920]){
      const page=await browser.newPage();await page.setViewport({width,height:900});
      await page.goto(origin+'/weekly',{waitUntil:'networkidle0'});await page.waitForSelector('.repo-card');
      assert.ok(await page.$eval('.repo-description',el=>el.scrollHeight<=el.clientHeight+1),'description is not clipped');
      assert.ok(await page.$eval('.repo-description',el=>parseFloat(getComputedStyle(el).fontSize)>=14),'description is comfortably sized');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await page.click('#listView');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`list view at ${width}px`);
      assert.ok(await page.$$eval('.repo-stats dd',els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),`counts fit at ${width}px`);
      await page.close();
    }
  });
  await t.test('visual identity uses a loaded shared vector mark, real featured data, and working hero links',async()=>{
    const page=await browser.newPage();
    const status=await fetch(origin+'/api/status').then(response=>response.json());
    status.metrics.totalStars=38610493;
    await page.setRequestInterception(true);
    page.on('request',request=>request.url().endsWith('/api/status')?request.respond({contentType:'application/json',body:JSON.stringify(status)}):request.continue());
    for(const width of [320,390,768,1440,1920]){
      await page.setViewport({width,height:1000});
      await page.goto(origin+'/',{waitUntil:'networkidle0'});
      assert.equal(await page.$$eval('h1',els=>els.length),1);
      assert.ok(await page.$eval('.brand-mark',img=>img.complete&&img.naturalWidth>0));
      assert.ok(await page.$eval('.hero-mark',img=>img.complete&&img.naturalWidth>0));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`hero ${width}px`);
      assert.equal(await page.$eval('.hero-feature strong',el=>el.textContent),varied[0].full_name);
      assert.equal(await page.$$eval('#mainNav .nav-icon svg',els=>els.length),14);
      assert.ok(await page.$eval('.hero-copy',el=>el.scrollWidth<=el.clientWidth+1),`hero copy ${width}px`);
      if(width<700)assert.ok(await page.evaluate(()=>document.querySelector('.hero-mark').getBoundingClientRect().bottom+8<=document.querySelector('.hero-feature').getBoundingClientRect().top),'full supplied wordmark never overlaps feature text');
      assert.ok(await page.$$eval('.metric-value',els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),`overview exact totals ${width}px`);
      await page.goto(origin+'/stats',{waitUntil:'networkidle0'});
      assert.ok(await page.$$eval('.metric-value',els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),`statistics exact totals ${width}px`);
    }
    await page.goto(origin+'/',{waitUntil:'networkidle0'});
    await page.focus('.hero-primary');await page.keyboard.press('Enter');
    await page.waitForSelector('#finderQuery');assert.match(page.url(),/\/discover$/);
    await page.goto(origin+'/',{waitUntil:'networkidle0'});
    await page.click('.hero-feature');await page.waitForSelector('.detail-heading');
    assert.match(page.url(),/\/repositories\/example\/clarity$/);
    await page.close();
  });
  await t.test('glass system has translucent surfaces, sans-serif type and an opaque accessibility fallback',async()=>{
    const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
    await page.goto(origin+'/',{waitUntil:'networkidle0'});
    const surfaces=await page.$$eval('.sidebar,.discovery-hero,.metric,.repo-card',els=>els.map(el=>({blur:getComputedStyle(el).backdropFilter,background:getComputedStyle(el).backgroundImage})));
    assert.ok(surfaces.length>5);
    for(const surface of surfaces){assert.match(surface.blur,/blur/);assert.match(surface.background,/rgba/);}
    assert.ok(await page.$eval('body',el=>getComputedStyle(el).backgroundImage.includes('radial-gradient')));
    assert.doesNotMatch(await page.$eval('.hero-copy em',el=>getComputedStyle(el).fontFamily),/Georgia|Times/);
    const cdp=await page.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-transparency: reduce)').matches),true);
    for(const selector of ['.sidebar','.repo-card','.hero-feature']){
      assert.equal(await page.$eval(selector,el=>getComputedStyle(el).backdropFilter),'none');
      assert.equal(await page.$eval(selector,el=>getComputedStyle(el).backgroundColor),'rgb(250, 249, 245)');
    }
    await page.close();
  });
  await t.test('statistics sorting is keyboard accessible, escaped, and survives reload',async()=>{
    const page=await browser.newPage();
    await page.setRequestInterception(true);
    const rows=[
      {language:'Python',repos:6,totalStars:10,totalForks:null,avgStars:2},
      {language:'Rust',repos:2,totalStars:null,totalForks:8,avgStars:null},
      {language:'JavaScript',repos:3,totalStars:0,totalForks:0,avgStars:0},
      {language:'<img src=x onerror=alert(1)>',repos:1,totalStars:1,totalForks:1,avgStars:1},
    ];
    page.on('request',request=>request.url().endsWith('/api/stats/languages')?request.respond({contentType:'application/json',body:JSON.stringify(rows)}):request.continue());
    await page.setViewport({width:390,height:900});
    await page.goto(origin+'/stats',{waitUntil:'networkidle0'});
    assert.equal(await page.evaluate(()=>Object.keys(Chart.instances).length),4);
    assert.ok(await page.evaluate(()=>Object.values(Chart.instances).every(chart=>chart.config.type==='bar')),'single-period history compares real values, not invented trend lines');
    for(const [key,first] of [['repos','Python'],['totalStars','Python'],['totalForks','Rust'],['avgStars','Python'],['language','<img src=x onerror=alert(1)>']]){
      await page.select('#languageSort',key);
      assert.equal(await page.$eval('#languageTable tr',el=>el.dataset.language),first);
      assert.equal(await page.$$eval('#languageTable img',els=>els.length),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    }
    await page.select('#languageSort','totalStars');
    await page.click('#languageDirection');
    assert.equal(await page.$eval('#languageTable tr',el=>el.dataset.language),'JavaScript');
    assert.equal(await page.$eval('#languageTable tr:last-child',el=>el.dataset.language),'Rust');
    await page.reload({waitUntil:'networkidle0'});
    assert.equal(await page.$eval('#languageSort',el=>el.value),'totalStars');
    assert.equal(await page.$eval('[data-sort-column="totalStars"]',el=>el.getAttribute('aria-sort')),'ascending');
    await page.focus('[data-language-sort="totalStars"]');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-sort-column="totalStars"]',el=>el.getAttribute('aria-sort')),'descending');
    assert.equal(await page.$$eval('th[aria-sort]',els=>els.length),1);
    await page.goto(origin+'/stats?sort=invalid&dir=invalid',{waitUntil:'networkidle0'});
    assert.equal(await page.$eval('#languageSort',el=>el.value),'repos');
    assert.equal(new URL(page.url()).search,'');
    await page.close();
  });
  await t.test('malformed client paths show a recoverable error instead of throwing',async()=>{
    const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/weekly',{waitUntil:'networkidle0'});
    await page.evaluate(()=>{history.pushState(null,'','/topics/%E0%A4%A');dispatchEvent(new PopStateEvent('popstate'));});
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.deepEqual(errors,[]);
    assert.equal(await page.$$eval('.error-state',els=>els.length),1);
    await page.close();
  });
});
