import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import puppeteer from 'puppeteer';
if (!process.env.TRENDSHIFT_DB_PATH) throw new Error('Set TRENDSHIFT_DB_PATH to a disposable production-data copy before auditing.');
const { createApp } = await import('./serve-api.js');
const { default: db } = await import('../src/lib/database.js');

const screenshots = process.env.AMANI_SCREENSHOTS || '/tmp/amani-website-evidence';
mkdirSync(screenshots, { recursive: true });
const server = createApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const status = await (await fetch(origin + '/api/status')).json();
  console.log(JSON.stringify(status, null, 2));
  assert.ok(status.periods.daily.count > 0); assert.ok(status.periods.weekly.count > 0); assert.ok(status.periods.monthly.count > 0);
  const repos = await (await fetch(origin + '/api/repos/daily')).json();
  assert.ok(repos.every(repo => repo.stargazers_count > 0 && repo.html_url.startsWith('https://github.com/')));
  const profile = '/repositories/' + repos[0].full_name;
  browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  for (const width of [390,768,1440]) for (const route of ['/', '/daily','/weekly','/monthly','/yearly','/stats','/insights','/live','/topics','/github-trending',profile]) {
    const page = await browser.newPage(); await page.setViewport({width,height:1040});
    const errors = []; page.on('pageerror',error => errors.push(error.message));
    await page.goto(origin + route,{waitUntil:'networkidle0'}); await page.waitForSelector('#mainContent:not([aria-busy])');
    assert.deepEqual(errors,[],route);
    assert.equal(await page.$$eval('.error-state',els=>els.length),0,route);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), `${route} at ${width}px overflow`);
    if (await page.$('.repo-card')) {
      assert.ok(await page.$$eval('.repo-description',els=>els.every(el=>el.scrollHeight<=el.clientHeight+1&&parseFloat(getComputedStyle(el).fontSize)>=14)),`${route} readable descriptions`);
      assert.ok(await page.$$eval('.repo-stats',els=>els.every(el=>el.innerText.includes('Total stars')&&el.innerText.includes('Total forks'))),`${route} visible statistic labels`);
      if(route==='/weekly'&&width===1440)await page.$('.repo-card').then(card=>card.screenshot({path:path.join(screenshots,'card-desktop.png')}));
    }
    if (route==='/stats') assert.equal(await page.evaluate(()=>Object.keys(Chart.instances).length),4);
    if (['/', '/weekly','/stats','/topics',profile].includes(route) && width!==768) {
      const name = route===profile ? 'repository' : route==='/' ? 'overview' : route.slice(1);
      await page.screenshot({path:path.join(screenshots,`${name}-${width}.png`),fullPage:true});
    }
    console.log(`PASS ${width}px ${route}`);
    await page.close();
  }
} finally {
  if(browser) await browser.close();
  await new Promise(resolve=>server.close(resolve)); db.close();
}
