import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { checkedFetch } from './http-check.js';

const base = (process.env.AMANI_PUBLIC_URL || 'https://kaluzy.github.io/amani/').replace(/\/?$/, '/');
const output = path.resolve(process.env.AMANI_BROWSER_EVIDENCE || '.amani/browser-evidence');
await mkdir(output, { recursive: true });
const get = async file => { const response = await fetch(new URL(file, base)); assert.ok(response.ok, file); return response.json(); };
const repos = await get('data/repos.json'), topics = await get('data/topics.json');
const featured = repos.find(repo => repo.full_name === 'obra/superpowers') || repos[0];
const profile = 'repositories/' + featured.full_name + '/';
const routes = ['', 'daily/','weekly/','monthly/','yearly/','stats/','insights/','live/','topics/','github-trending/','workbench/','guide/','submit/','about/','privacy/','terms/','contact/',profile,'topics/'+encodeURIComponent(topics[0].slug)+'/'];
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
const errors = [], failed = [], transientRetries = [], links = new Set(); let combinations = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  for (const width of [320,390,768,1440]) {
    await page.setViewport({ width, height: 1000 });
    for (const route of routes) {
      const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle0', timeout: 45000 });
      assert.ok(response.ok() || response.status() === 304, `${width}px ${route || '/'}: HTTP ${response.status()}`); await page.waitForSelector('#mainContent:not([aria-busy])');
      assert.equal(await page.$$eval('.error-state', elements => elements.length), 0, `${width} ${route}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} ${route} overflow`);
      if (route === 'stats/') assert.equal(await page.evaluate(() => Object.keys(Chart.instances).length), 4);
      for (const href of await page.$$eval('a[href]', elements => elements.map(element => element.href))) if (href.startsWith(base)) links.add(href);
      if ([390,1440].includes(width) && ['', 'daily/', 'guide/', 'stats/'].includes(route)) await page.screenshot({ path: path.join(output, `${route ? route.slice(0,-1) : 'overview'}-${width}.png`), fullPage: true });
      if (width === 1440 && ['daily/','weekly/','monthly/'].includes(route)) {
        const groups = await page.$$eval('.repo-card', cards => {
          const rows = new Map();
          for (const card of cards) { const top = Math.round(card.getBoundingClientRect().top); if (!rows.has(top)) rows.set(top, []); rows.get(top).push(card); }
          return [...rows.values()].map(row => ['.repo-identity','.repo-description','.repo-language-row','.repo-stats','.repo-growth','.repo-actions','.repo-save'].map(selector => row.map(card => card.querySelector(selector).getBoundingClientRect().top)));
        });
        for (const row of groups) for (const positions of row) assert.ok(Math.max(...positions)-Math.min(...positions)<=1, `${route} aligned sections`);
      }
      combinations++;
    }
    console.log(`PASS ${width}px: ${routes.length} routes, charts, no overflow`);
  }
  await page.goto(new URL('stats/', base).href, { waitUntil: 'networkidle0' });
  for (const key of ['repos','totalStars','totalForks','avgStars','language']) {
    await page.select('#languageSort', key);
    assert.equal(await page.$eval('th[aria-sort]', element=>element.dataset.sortColumn), key);
    await page.click('#languageDirection');
    const direction = await page.$eval('th[aria-sort]', element=>element.getAttribute('aria-sort'));
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#languageSort', element=>element.value), key);
    assert.equal(await page.$eval('th[aria-sort]', element=>element.getAttribute('aria-sort')), direction);
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(new URL('daily/', base).href, { waitUntil: 'networkidle0' });
  await page.select('#sortSelect','stars'); await page.click('#listView');
  const saved = (await page.$$eval('[data-save-repo]', buttons => buttons.map(button => button.dataset.saveRepo))).slice(0,3);
  for (const name of saved) await page.click(`[data-save-repo="${name}"]`);
  await page.click('#mainNav a[href$="/workbench"]'); await page.waitForSelector('.comparison-table');
  assert.equal(await page.$$eval('.comparison-table thead th', cells => cells.length), saved.length+1);
  for (const width of [320,390,768,1440]) {
    await page.setViewport({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1), `comparison ${width}px`);
    if ([390,1440].includes(width)) await page.screenshot({ path: path.join(output, `workbench-${width}.png`), fullPage: true });
  }
  const shared = await page.$eval('#comparisonLink', input => input.value);
  const visitor = await browser.createBrowserContext(), other = await visitor.newPage();
  await other.goto(shared, { waitUntil: 'networkidle0' }); await other.waitForSelector('.comparison-table');
  assert.equal(await other.$eval('#savedCount', element=>element.textContent),'0'); await visitor.close();
  await page.setViewport({ width: 390, height: 700 });
  await page.click('#menuToggle');
  await page.waitForFunction(() => document.getElementById('sidebar').classList.contains('open') && Math.abs(document.getElementById('sidebar').getBoundingClientRect().left) < 1);
  await page.locator('#mainNav a[href$="/guide"]').click(); await page.waitForSelector('.field-guide');
  assert.equal(await page.$eval('#menuToggle', element=>element.getAttribute('aria-expanded')),'false');
  for (const link of links) {
    const response = await checkedFetch(link, { onRetry: retry => transientRetries.push(retry) });
    assert.ok(response.ok, `Public link ${link}: ${response.status}`);
    await response.arrayBuffer();
  }
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  const report = { checkedAt: new Date().toISOString(), result: 'pass', routeViewportCombinations: combinations, uniqueInternalLinks: links.size, comparisonWidths: 4, transientRetries, browser: 'Chromium', base };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
