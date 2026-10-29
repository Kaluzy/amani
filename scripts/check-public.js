import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export async function checkPublic(baseURL = 'https://kaluzy.github.io/amani/', { expectedCommit = process.env.EXPECTED_COMMIT } = {}) {
  const base = new URL(baseURL.endsWith('/') ? baseURL : baseURL + '/');
  const checks = [];
  const get = async (file, json = true) => {
    const url = new URL(file, base);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    assert.ok(response.ok, `${url}: HTTP ${response.status}`);
    checks.push(url.href);
    return json ? response.json() : response.text();
  };
  let build;
  for (let attempt = 0; attempt < 5; attempt++) {
    build = await get('build.json?release=' + encodeURIComponent(expectedCommit || 'latest'));
    if (!expectedCommit || build.commit === expectedCommit) break;
    if (attempt === 4) throw new Error('Public CDN is not serving the expected release yet');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const status = await get('data/status.json');
  for (const period of ['daily', 'weekly', 'monthly']) assert.ok(status.periods?.[period]?.count > 0, `Missing ${period} collection`);
  const repos = await get('data/repos.json');
  assert.equal(repos.length, build.repositories);
  const topics = await get('data/topics.json');
  for (const file of ['data/repos/daily.json','data/repos/weekly.json','data/repos/monthly.json','data/repos/yearly.json','data/stats/languages.json','data/live-mentions.json']) assert.ok(Array.isArray(await get(file)), file);
  const charts = await get('data/stats/charts.json');
  for (const key of ['monthlyStars','monthlyForks','yearlyStars','yearlyForks']) assert.ok(Array.isArray(charts[key]?.datasets) && Array.isArray(charts[key]?.labels), key);
  assert.ok(Array.isArray((await get('data/insights.json')).most_starred));
  const repo = repos[0]; assert.equal((await get('data/repos/detail/' + repo.full_name + '.json')).full_name, repo.full_name);
  if (topics.length) assert.ok((await get('data/topics/' + encodeURIComponent(topics[0].slug) + '/repos.json')).length);
  for (const file of ['', 'guide/', 'workbench/', 'submit/', 'repositories/' + repo.full_name + '/']) {
    const html = await get(file, false); assert.match(html, /id="mainContent"/); assert.match(html, /Content-Security-Policy/);
  }
  assert.match(await get('sitemap.xml', false), /<urlset/);
  console.log(JSON.stringify({ result: 'pass', checks: checks.length, build, checkedAt: new Date().toISOString() }, null, 2));
  return { checks, build };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) checkPublic(process.env.AMANI_PUBLIC_URL).catch(error => { console.error(error.message); process.exitCode = 1; });
