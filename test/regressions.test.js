import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import puppeteer from 'puppeteer';

test('website engineering: integrity, source parsing, API and real responsive interactions', { timeout: 180000 }, async t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'amani-engineering-'));
  process.env.AMANI_DB_PATH = path.join(temp, 'test.db');
  const { default: db, upsertRepo, recordStarSnapshot } = await import('../src/lib/database.js');
  const { collect, listRepos } = await import('../src/lib/catalog.js');
  const { parseTrending } = await import('../scripts/scrape-trending.js');
  const { chartData } = await import('../src/lib/chart-data.js');
  const { createApp } = await import('../scripts/serve-api.js');
  let server, browser;
  t.after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    db.close(); rmSync(temp, { recursive: true, force: true });
  });
  const attack = '<img src=x onerror="window.__injected=true">';
  const fixture = i => ({ full_name: `test/project-${i}`, owner: { login: 'test' }, name: `project-${i}`,
    description: i === 1 ? attack : `A useful project ${i} for building thoughtful software.`,
    language: i % 2 ? 'JavaScript' : 'Python', html_url: `https://github.com/test/project-${i}`,
    stargazers_count: 1000 + i * 100, forks_count: 20 + i, watchers_count: 3, open_issues_count: 2,
    created_at: `2026-10-${String((i % 26) + 1).padStart(2, '0')}`, updated_at: '2026-10-27',
    license: { name: 'MIT' }, topics: ['cli', i % 2 ? 'developer-tools' : 'python'], default_branch: 'main' });
  await t.test('A/B/A identity and sparse upserts preserve known counts and metadata', () => {
    const a = upsertRepo(fixture(1)); const b = upsertRepo(fixture(2));
    assert.notEqual(a, b); assert.equal(upsertRepo(fixture(1)), a);
    upsertRepo({ full_name: 'test/project-1', description: 'updated' });
    const saved = db.prepare('SELECT * FROM repos WHERE id=?').get(a);
    assert.equal(saved.stargazers_count, 1100); assert.equal(saved.created_at, fixture(1).created_at);
    assert.equal(saved.topics, JSON.stringify(fixture(1).topics));
  });
  await t.test('Trending parser extracts reported counts without API default-zero fallback', () => {
    const parsed = parseTrending('<article class="Box-row"><h2><a href="/owner/repository">owner/repository</a></h2><p>Description</p><span itemprop="programmingLanguage">Go</span><a href="/owner/repository/stargazers">12,345</a><a href="/owner/repository/forks">123</a><span class="float-sm-right">2,345 stars this week</span></article>');
    assert.equal(parsed.length, 1); assert.equal(parsed[0].stargazers_count, 12345); assert.equal(parsed[0].stars_today, 2345); assert.equal(parsed[0].forks_count, 123);
    assert.equal(parseTrending('<h1>Rate limited</h1>').length, 0);
  });
  await t.test('complete collections replace old membership and rollback invalid runs', () => {
    collect('weekly', [fixture(1), fixture(2)]);
    collect('weekly', [{ ...fixture(2), stars_today: 5 }]);
    assert.deepEqual(listRepos('weekly').map(r => r.full_name), ['test/project-2']);
    const before = db.prepare('SELECT COUNT(*) n FROM collection_runs').get().n;
    assert.throws(() => collect('weekly', [fixture(3), { ...fixture(4), stargazers_count: null }]), /Invalid stargazers/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM collection_runs').get().n, before);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM repos WHERE full_name='test/project-3'").get().n, 0);
  });
  const rows = Array.from({ length: 29 }, (_, i) => ({ ...fixture(i + 1), stars_today: 100 - i }));
  for (const period of ['daily', 'weekly', 'monthly']) collect(period, rows);
  await t.test('yearly uses two distinct dates, and cumulative charts do not double-count', () => {
    assert.equal(listRepos('yearly').length, 0);
    const id = rows[0].full_name;
    const repoId = db.prepare('SELECT id FROM repos WHERE full_name=?').get(id).id;
    db.prepare("INSERT INTO star_history (repo_id,timestamp,stars,forks,watchers,open_issues,source) VALUES (?,datetime('now','-2 days'),1000,10,0,0,'github')").run(repoId);
    assert.equal(listRepos('yearly')[0].stars_gained, 100);
    const before = chartData('month', 'stars').datasets.reduce((total, dataset) => total + dataset.data.reduce((sum, value) => sum + (value || 0), 0), 0);
    recordStarSnapshot(repoId, rows[0].stargazers_count, rows[0].forks_count, 3, 2);
    const after = chartData('month', 'stars').datasets.reduce((total, dataset) => total + dataset.data.reduce((sum, value) => sum + (value || 0), 0), 0);
    assert.equal(before, after);
  });
  server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const json = async route => { const response = await fetch(origin + route); assert.equal(response.status, 200, route); return response.json(); };
  await t.test('all feature APIs use normalized real data; invalid routes and submissions are handled', async () => {
    const status = await json('/api/status'); assert.equal(status.version, '3.1.0');
    for (const period of ['daily','weekly','monthly','yearly']) assert.ok((await json('/api/repos/' + period)).length > 0);
    const repos = await json('/api/repos'); assert.equal(repos.length, 29); assert.equal(repos[0].owner.login, 'test');
    const detail = await json('/api/repos/detail/test/project-1'); assert.equal(detail.full_name, 'test/project-1'); assert.ok(detail.star_history.length > 1);
    for (const route of ['/api/stats','/api/stats/languages','/api/stats/charts','/api/topics','/api/topics/cli/repos','/api/live-mentions','/api/insights']) await json(route);
    assert.equal((await fetch(origin + '/api/repos/not-a-period')).status, 400);
    assert.equal((await fetch(origin + '/api/repos/detail/missing/repo')).status, 404);
    assert.equal((await fetch(origin + '/does-not-exist')).status, 404);
    const post = repository => fetch(origin + '/api/submissions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({repository}) });
    assert.equal((await post('https://evil.example/owner/repo')).status, 400);
    assert.equal((await post('<script>alert(1)</script>')).status, 400);
    assert.equal((await post('https://github.com/valid/repository')).status, 201);
    assert.equal((await post('valid/repository')).status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM submissions WHERE full_name='valid/repository'").get().n, 1);
  });
  browser = await puppeteer.launch({ headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  const screenshotDir = process.env.AMANI_SCREENSHOTS || path.join(temp, 'screenshots');
  mkdirSync(screenshotDir, { recursive:true });
  const open = async (route, width=1440) => {
    const page = await browser.newPage(); await page.setViewport({ width, height: 1050, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const badRequests = []; page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400 && !route.includes('missing') && !route.includes('does-not-exist')) badRequests.push(`${response.status()} ${response.url()}`); });
    await page.goto(origin + route, { waitUntil:'networkidle0' });
    await page.waitForSelector('#mainContent:not([aria-busy])');
    return { page, errors, badRequests };
  };
  await t.test('all main pages render real charts and never overflow at mobile/tablet/desktop sizes', async () => {
    for (const width of [390,768,1440]) for (const route of ['/', '/daily','/weekly','/monthly','/yearly','/stats','/insights','/live','/topics','/topics/cli','/github-trending','/repositories/test/project-1','/submit']) {
      const { page,errors,badRequests } = await open(route,width);
      assert.deepEqual(errors, [], `${route} ${width}px script errors`); assert.deepEqual(badRequests, [], `${route} ${width}px requests`);
      assert.equal(await page.evaluate(() => Boolean(window.__injected)), false);
      assert.equal(await page.$$eval('img[onerror]', els => els.length), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${route} ${width}px overflows`);
      assert.equal(await page.$$eval('.error-state', els => els.length), 0, `${route} rendered an error`);
      const text = await page.$eval('#mainContent', element => element.innerText);
      assert.ok(text.trim().length > 40, `${route} has content`);
      if (route === '/stats') assert.equal(await page.evaluate(() => Object.keys(Chart.instances).length), 4, 'real chart instances');
      if (['/','/daily','/weekly','/monthly'].includes(route)) assert.equal(await page.$$eval('.repo-card', els => els.length),12);
      if (width === 1440 && ['/','/stats','/repositories/test/project-1','/topics'].includes(route)) await page.screenshot({ path: path.join(screenshotDir, (route.replaceAll('/','_') || 'overview') + '-desktop.png'), fullPage:true });
      if (width === 390 && ['/', '/stats','/weekly'].includes(route)) await page.screenshot({path:path.join(screenshotDir,(route.replaceAll('/','_') || 'overview')+'-mobile.png'),fullPage:true});
      await page.close();
    }
  });
  await t.test('search, language, sort, grid/list, pagination, detail links and browser back work', async () => {
    const {page} = await open('/daily');
    await page.select('#sortSelect','stars');
    assert.equal(await page.$eval('.repo-card', el => el.dataset.repository), 'test/project-29');
    await page.select('#languageSelect','Python');
    assert.equal(await page.$$eval('.repo-card', els => els.every(el => el.innerText.includes('Python'))),true);
    await page.select('#languageSelect',''); await page.select('#sortSelect','rank');
    await page.click('#loadMoreBtn'); assert.equal(await page.$$eval('.repo-card', els=>els.length),24);
    await page.click('#listView'); assert.equal(await page.$eval('#repoGrid', el=>el.classList.contains('list-view')),true);
    await page.type('#globalSearch','project-29'); await page.waitForFunction(()=>document.querySelectorAll('.repo-card').length===1);
    assert.equal(await page.$eval('.repo-card',el=>el.dataset.repository),'test/project-29');
    await page.$eval('#globalSearch',el=>{el.value='no-such-project';el.dispatchEvent(new Event('input',{bubbles:true}));}); await page.waitForSelector('#emptyResults');
    await page.$eval('#globalSearch',el=>{el.value='project-1';el.dispatchEvent(new Event('input',{bubbles:true}));}); await page.waitForSelector('.repo-name a');
    await page.click('.repo-name a'); await page.waitForSelector('.detail-heading');
    await page.goBack(); await page.waitForSelector('#repoGrid');
    await page.close();
  });
  await t.test('mobile navigation, topic selection and durable repository submission work', async () => {
    const {page} = await open('/topics',390);
    await page.click('#menuToggle'); assert.equal(await page.$eval('#menuToggle',el=>el.getAttribute('aria-expanded')),'true');
    await page.waitForFunction(() => document.getElementById('sidebar').getBoundingClientRect().left >= -1);
    await page.click('#mainNav a[href="/weekly"]'); await page.waitForSelector('#repoGrid');
    assert.equal(await page.$eval('#menuToggle',el=>el.getAttribute('aria-expanded')),'false');
    await page.goto(origin + '/topics',{waitUntil:'networkidle0'});
    await page.type('#topicSearch','developer'); assert.equal(await page.$$eval('.topic-card',els=>els.length),1);
    await page.click('.topic-card'); await page.waitForSelector('#repoGrid'); assert.match(page.url(),/\/topics\/developer-tools/);
    await page.goto(origin + '/submit',{waitUntil:'networkidle0'});
    await page.type('#repositoryURL','https://github.com/browser/suggestion'); await page.click('#submitForm button');
    await page.waitForFunction(()=>document.getElementById('submitMessage').textContent.includes('saved for review'));
    assert.equal(db.prepare("SELECT status FROM submissions WHERE full_name='browser/suggestion'").get().status,'pending');
    await page.close();
  });
  await t.test('failures have retry states, legacy redirects work, and informational routes are present', async () => {
    const page = await browser.newPage(); await page.setRequestInterception(true);
    page.on('request',request=>request.url().includes('/api/repos/daily') ? request.respond({status:503,contentType:'application/json',body:'{"error":"Temporarily unavailable"}'}) : request.continue());
    await page.goto(origin+'/daily',{waitUntil:'networkidle0'}); await page.waitForSelector('#retryPage'); assert.match(await page.$eval('.error-state',el=>el.innerText),/Temporarily unavailable/); await page.close();
    for (const route of ['/about','/privacy','/terms','/contact','/does-not-exist']) { const {page,errors}=await open(route); assert.deepEqual(errors,[]); assert.ok((await page.$eval('main',el=>el.innerText)).length>50); await page.close(); }
    assert.equal((await fetch(origin+'/weekly.html',{redirect:'manual'})).status,302);
  });
  await t.test('a genuinely empty database has honest empty states and no fabricated charts', async () => {
    db.transaction(() => db.exec('DELETE FROM collection_entries; DELETE FROM collection_runs; DELETE FROM star_history; DELETE FROM trending_snapshots; DELETE FROM repos;'))();
    for (const route of ['/daily','/weekly','/monthly','/yearly','/stats','/topics','/live','/insights']) {
      const {page,errors}=await open(route); assert.deepEqual(errors,[],route);
      assert.equal(await page.$$eval('.error-state',els=>els.length),0,route);
      assert.ok((await page.$eval('main',el=>el.innerText)).length>50,route);
      if(route==='/stats') assert.equal(await page.evaluate(()=>Object.keys(Chart.instances).length),0);
      await page.close();
    }
  });
});
