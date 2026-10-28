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
test('QA cards and navigation work in the real browser',{timeout:60000},async t=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'amani-card-browser-'));
  process.env.TRENDSHIFT_DB_PATH=path.join(temp,'db.sqlite');
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
