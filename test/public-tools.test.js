import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import puppeteer from 'puppeteer';
import {filterProjects,discussionLinks} from '../public/discovery.js';

const repos=[
  {full_name:'example/python',description:'automation',language:'Python',license:{name:'MIT'},topics:['tools'],stargazers_count:20000,forks_count:10,archived:false,updated_at:'2026-10-30'},
  {full_name:'example/typescript',description:'components',language:'TypeScript',license:{name:'Apache-2.0'},topics:['ui'],stargazers_count:100,forks_count:20,archived:true,updated_at:'2026-10-29'},
  {full_name:'example/unknown',topics:[],stargazers_count:null,forks_count:null},
];
test('project finder filters actual metadata without estimating unknown counts',()=>{
  assert.deepEqual(filterProjects(repos,{language:'Python',min:'10000',active:true}).map(repo=>repo.full_name),['example/python']);
  assert.deepEqual(filterProjects(repos,{license:'Apache-2.0'}).map(repo=>repo.full_name),['example/typescript']);
  assert.deepEqual(filterProjects(repos,{savedOnly:true,saved:['example/unknown']}).map(repo=>repo.full_name),['example/unknown']);
  assert.equal(filterProjects(repos,{q:'automation'}).length,1);
  assert.equal(filterProjects(repos,{min:'100'}).length,2);
  assert.equal(filterProjects(repos,{sort:'forks'})[0].full_name,'example/typescript');
  assert.equal(repos[0].full_name,'example/python');
  const links=discussionLinks('github.com/a/b " & <img>');
  assert.equal(new URL(links.reddit).searchParams.get('q'),'github.com/a/b " & <img>');
  assert.equal(new URL(links.x).hostname,'x.com');
});
test('supplied logo bytes are published without a fabricated replacement',()=>{
  const logo=readFileSync(new URL('../public/brand-logo.png',import.meta.url));
  assert.equal(logo.subarray(1,4).toString(),'PNG');
  assert.match(readFileSync(new URL('../public/shell.html',import.meta.url),'utf8'),/brand-logo\.png/);
});
test('public tools and consent-gated analytics work in Chromium',{timeout:90000},async t=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'amani-tools-'));process.env.AMANI_DB_PATH=path.join(temp,'test.sqlite');
  const {default:db}=await import('../src/lib/database.js');const{collect}=await import('../src/lib/catalog.js');const{createApp}=await import('../scripts/serve-api.js');
  for(const period of ['daily','weekly','monthly'])collect(period,repos.slice(0,2));
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true});});
  await t.test('finder URL/reload, filters, saving and safe community links work',async()=>{
    const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    for(const width of [320,390,768,1440]){
      await page.setViewport({width,height:1000});await page.goto(origin+'/discover',{waitUntil:'networkidle0'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.goto(origin+'/community',{waitUntil:'networkidle0'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    await page.goto(origin+'/discover',{waitUntil:'networkidle0'});
    await page.select('#finderLanguage','Python');await page.select('#finderMinimum','10000');
    assert.equal(await page.$$eval('#finderResults .repo-card',elements=>elements.length),1);
    await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval('#finderLanguage',el=>el.value),'Python');
    await page.click('[data-save-repo]');await page.click('#finderSaved');assert.equal(await page.$$eval('#finderResults .repo-card',elements=>elements.length),1);
    await page.goto(origin+'/community?q='+encodeURIComponent('github.com/a/b " <img src=x onerror=alert(1)>'),{waitUntil:'networkidle0'});
    assert.equal(await page.$$eval('#communityLinks img',elements=>elements.length),0);
    assert.equal(await page.$$eval('#communityLinks a',elements=>elements.length),2);
    assert.match(await page.$eval('#communityLinks a',el=>el.href),/^https:\/\/www\.reddit\.com\/search/);
    assert.match(await page.$eval('#mainContent',el=>el.textContent),/Not connected/);
    assert.deepEqual(errors,[]);await page.close();
  });
  const configuredPage=async({privacy=false,blockedStorage=false}={})=>{
    const context=await browser.createBrowserContext();const page=await context.newPage();await page.setViewport({width:1440,height:1000});const network=[];
    if(privacy)await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator,'globalPrivacyControl',{get:()=>true}));
    if(blockedStorage)await page.evaluateOnNewDocument(()=>Object.defineProperty(window,'localStorage',{get:()=>{throw new Error('blocked');}}));
    await page.setRequestInterception(true);
    page.on('request',async request=>{
      if(request.url().includes('googletagmanager.com')){network.push(request.url());await request.respond({contentType:'application/javascript',body:'/* isolated test stub: no data leaves the test */'});return;}
      if(request.isNavigationRequest()&&request.url().startsWith(origin)){
        const response=await fetch(request.url());let body=await response.text();body=body.replace('<meta name="amani-ga4" content="">','<meta name="amani-ga4" content="G-TEST123456">');await request.respond({status:response.status,contentType:'text/html',body});return;
      }
      await request.continue();
    });
    return {context,page,network};
  };
  await t.test('no analytics before consent; SPA pageviews omit query/fragment; withdrawal stops tracking',async()=>{
    const {context,page,network}=await configuredPage();
    await page.goto(origin+'/daily?q=private-search#secret',{waitUntil:'networkidle0'});
    assert.equal(network.length,0);assert.ok(await page.$('#analyticsPanel'));
    await page.$$eval('#analyticsPanel button',buttons=>buttons.find(button=>button.textContent==='Allow analytics').click());
    await page.waitForFunction(()=>window.dataLayer?.some(row=>row[0]==='event'&&row[1]==='page_view'));
    assert.equal(network.length,1);
    await page.click('#mainNav a[href="/stats"]');await page.waitForSelector('#languageSort');
    const events=await page.evaluate(()=>window.dataLayer.filter(row=>row[0]==='event').map(row=>[row[1],row[2]]));
    assert.equal(events.filter(row=>row[0]==='page_view').length,2);
    assert.ok(events.every(row=>!JSON.stringify(row).includes('private-search')&&!JSON.stringify(row).includes('secret')));
    await page.click('#analyticsSettings');
    await page.$$eval('#analyticsPanel button',buttons=>buttons.find(button=>button.textContent==='Decline analytics').click());
    await page.waitForFunction(()=>document.querySelector('#mainContent:not([aria-busy])')&&!document.getElementById('amaniAnalyticsTag'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('amani:analytics-consent:v1')),'denied');
    await page.reload({waitUntil:'networkidle0'});assert.equal(network.length,1);await context.close();
  });
  await t.test('browser privacy signals and blocked storage do not break tools',async()=>{
    const privateVisitor=await configuredPage({privacy:true});await privateVisitor.page.goto(origin+'/daily',{waitUntil:'networkidle0'});
    assert.equal(privateVisitor.network.length,0);await privateVisitor.page.click('#analyticsSettings');
    assert.match(await privateVisitor.page.$eval('#analyticsPanel',el=>el.textContent),/Analytics stays off/);await privateVisitor.context.close();
    const blocked=await configuredPage({blockedStorage:true});await blocked.page.goto(origin+'/daily',{waitUntil:'networkidle0'});
    await blocked.page.$$eval('#analyticsPanel button',buttons=>buttons.find(button=>button.textContent==='Decline analytics').click());
    assert.equal(blocked.network.length,0);assert.ok(await blocked.page.$('.repo-card'));await blocked.context.close();
  });
});
