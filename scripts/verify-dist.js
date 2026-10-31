import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

export async function verifyDist(output = process.env.PAGES_OUTPUT || 'dist') {
  const root = path.resolve(output);
  const read = file => readFile(path.join(root, file), 'utf8');
  const manifest = JSON.parse(await read('release-manifest.json'));
  const build = JSON.parse(await read('build.json'));
  const xml = cheerio.load(await read('sitemap.xml'), { xmlMode: true });
  assert.equal(xml('url').length, manifest.routes.length - 1, 'Every indexable route is in the sitemap');
  const endpoints = new Map();
  for (const asset of manifest.assets) {
    assert.ok((await stat(path.join(root,asset))).isFile(), `Missing asset ${asset}`);
    if (!asset.endsWith('.js')) continue;
    const source = await read(asset);
    assert.ok(!new RegExp(['trend','shift'].join(''),'i').test(source), 'Legacy branding cannot ship in application modules');
    for (const match of source.matchAll(/\bfrom\s*['"]\.\/([^'"]+)['"]/g)) {
      const [name, revision] = match[1].split('?v=');
      assert.ok(manifest.assets.includes(name), `Missing imported module ${name}`);
      assert.equal(revision, build.assetRevision, 'All modules use the same release revision');
    }
  }
  for (const endpoint of manifest.endpoints) {
    const file = 'data' + decodeURIComponent(endpoint.slice(4)) + '.json';
    endpoints.set(endpoint, JSON.parse(await read(file)));
  }
  const repos = endpoints.get('/api/repos');
  assert.equal(repos.length, build.repositories);
  assert.equal(new Set(repos.map(repo => repo.full_name)).size, repos.length);
  const names = new Set(repos.map(repo => repo.full_name));
  const status = endpoints.get('/api/status');
  assert.equal(status.metrics.totalRepos, repos.length, 'Published metrics match the complete catalog');
  const seed = JSON.parse(await read('data/public-seed.json'));
  assert.equal(seed.repositories.length, repos.length, 'Recovery seed matches the current release');
  assert.ok(seed.repositories.every(repo => names.has(repo.full_name)), 'Recovery seed cannot contain stale or private extra repositories');
  const numeric = value => value == null || (Number.isSafeInteger(value) && value >= 0);
  for (const repo of repos) {
    assert.ok(numeric(repo.stargazers_count) && numeric(repo.forks_count), repo.full_name);
    assert.ok(repo.html_url.startsWith('https://github.com/'), repo.full_name);
    const detail = endpoints.get('/api/repos/detail/' + repo.full_name);
    assert.equal(detail?.full_name, repo.full_name, 'Each repository has its own data endpoint');
    assert.ok(Array.isArray(detail.star_history));
    for (const observation of detail.star_history) assert.ok(observation.stars != null && observation.forks != null && numeric(observation.stars) && numeric(observation.forks));
  }
  for (const period of ['daily', 'weekly', 'monthly', 'yearly']) {
    const rows = endpoints.get('/api/repos/' + period);
    assert.equal(status.periods[period].count, rows.length, `${period} coverage matches published rows`);
    assert.equal(new Set(rows.map(repo => repo.full_name)).size, rows.length, period);
    for (const [index, repo] of rows.entries()) { assert.ok(names.has(repo.full_name), `${period}: ${repo.full_name}`); assert.equal(repo.rank, index + 1); }
  }
  for (const chart of Object.values(endpoints.get('/api/stats/charts'))) {
    assert.ok(Array.isArray(chart.labels) && Array.isArray(chart.datasets));
    for (const dataset of chart.datasets) { assert.equal(dataset.data.length, chart.labels.length); assert.ok(dataset.data.every(numeric)); }
  }
  for (const topic of endpoints.get('/api/topics')) {
    const rows = endpoints.get('/api/topics/' + encodeURIComponent(topic.slug) + '/repos');
    assert.ok(rows?.length > 0, topic.slug);
    assert.equal(rows.length, topic.count);
    assert.ok(rows.every(repo => names.has(repo.full_name) && repo.topics.includes(topic.slug)), topic.slug);
  }
  for (const route of manifest.routes) {
    const file = route === '/' ? 'index.html' : path.join(decodeURIComponent(route.slice(1)), 'index.html');
    const html = await read(file), $ = cheerio.load(html);
    assert.equal($('main#mainContent').length, 1, route);
    assert.ok($('title').text().includes('Amani'), route);
    assert.ok($('meta[name="description"]').attr('content')?.length > 20, route);
    assert.equal($('link[rel="canonical"]').attr('href'), manifest.origin + manifest.base + (route === '/' ? '/' : route + '/'));
    assert.ok($('meta[http-equiv="Content-Security-Policy"]').length, route);
    for (const item of $('[src],link[href]').toArray()) {
      const value = $(item).attr('src') || $(item).attr('href');
      if (!value?.startsWith(manifest.base + '/')) continue;
      const target = decodeURIComponent(value.slice(manifest.base.length + 1).split('?')[0]);
      if (/\.(?:js|css|svg|png)$/.test(target)) assert.ok(value.endsWith('?v='+build.assetRevision), 'Static assets must avoid mixed-release browser caches');
      assert.ok((await stat(path.join(root, target))).isFile(), `${route}: ${target}`);
    }
    assert.ok(!new RegExp(['trend','shift'].join(''),'i').test(html), 'Legacy branding cannot ship in HTML');
  }
  for(const period of manifest.feeds || []){
    const $=cheerio.load(await read('feeds/'+period+'.xml'),{xmlMode:true});
    const rows=endpoints.get('/api/repos/'+period);
    assert.equal($('item').length,rows.length,'Feed matches the actual period collection');
    $('item').each((index,item)=>{
      assert.equal($(item).find('title').text(),rows[index].full_name);
      assert.ok($(item).find('link').text().startsWith(manifest.origin+manifest.base+'/repositories/'));
    });
  }
  const walk = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      assert.ok(!/\.(?:db|sqlite)(?:-wal|-shm)?$|^\.env(?:\.|$)|^\.git$|^\.backups$|^node_modules$|^(?:AGENTS|COORDINATION)\.md$/i.test(entry.name), `Private file: ${file}`);
      if (entry.isDirectory()) await walk(file);
    }
  };
  await walk(root);
  const summary = { routes: manifest.routes.length, jsonEndpoints: endpoints.size, repositories: repos.length, assets: manifest.assets.length, result: 'pass' };
  console.log('Artifact checks:', JSON.stringify(summary));
  return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) verifyDist().catch(error => { console.error(error.message); process.exitCode = 1; });
