import * as cheerio from 'cheerio';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import db, { upsertRepo } from '../src/lib/database.js';
import { collect } from '../src/lib/catalog.js';

const root = new URL('../', import.meta.url);
export function parseTrending(html) {
  const $ = cheerio.load(html);
  const count = text => {
    const match = text.trim().replaceAll(',', '').match(/^(\d+(?:\.\d+)?)\s*([km])?/i);
    return match ? Math.round(Number(match[1]) * ({ k: 1000, m: 1000000 }[match[2]?.toLowerCase()] || 1)) : null;
  };
  return $('article.Box-row').map((index, element) => {
    const row = $(element);
    const href = row.find('h2 a, h1 a').first().attr('href') || '';
    return {
      full_name: href.replace(/^\//, ''), rank: index + 1,
      name: href.split('/')[2], owner: { login: href.split('/')[1] },
      html_url: `https://github.com${href}`,
      description: row.find('p').first().text().trim() || undefined,
      language: row.find('[itemprop="programmingLanguage"]').text().trim() || null,
      stargazers_count: count(row.find('a[href$="/stargazers"]').text()),
      forks_count: count(row.find('a[href$="/forks"]').text()),
      stars_today: count(row.find('span.float-sm-right').text()),
    };
  }).get().filter(repo => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.full_name));
}

export async function enrichRepoData(repo) {
  const response = await fetch(`https://api.github.com/repos/${repo.full_name}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Amani-Repository-Tracker' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`GitHub enrichment failed: ${response.status}`);
  const data = await response.json();
  for (const field of ['stargazers_count', 'forks_count', 'watchers_count', 'open_issues_count']) {
    if (!Number.isSafeInteger(data[field]) || data[field] < 0) throw new Error(`Invalid GitHub count: ${field}`);
  }
  return { ...repo, ...data, html_url: data.html_url || repo.html_url || repo.url };
}

export async function importKnownMetadata(cachePath = fileURLToPath(new URL('.amani/cache/trending.json', root))) {
  let data;
  try { data = JSON.parse(await readFile(cachePath, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  const rows = (data.repos || []).filter(repo => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.full_name)
    && Number.isSafeInteger(repo.stargazers_count) && repo.stargazers_count >= 0
    && Number.isSafeInteger(repo.forks_count) && repo.forks_count >= 0);
  // Restore API metadata only. Cache timestamps do not establish star history.
  db.transaction(() => {
    for (const repo of rows) {
      const previous = db.prepare('SELECT * FROM repos WHERE full_name = ?').get(repo.full_name);
      if (!previous) { upsertRepo(repo); continue; }
      const patch = { full_name: repo.full_name, name: previous.name };
      for (const field of ['description', 'language', 'html_url', 'created_at', 'updated_at', 'default_branch']) {
        if (previous[field] == null || previous[field] === '') patch[field] = repo[field];
      }
      if (!previous.license) patch.license = repo.license;
      if (!previous.topics || previous.topics === '[]') patch.topics = repo.topics;
      if (previous.size_kb == null) patch.size = repo.size;
      const observed = db.prepare("SELECT 1 FROM star_history WHERE repo_id = ? AND source IN ('github', 'trending-v3', 'github-cache') LIMIT 1").get(previous.id);
      if (previous.stargazers_count === 0 && !observed) {
        for (const field of ['stargazers_count', 'forks_count', 'watchers_count', 'open_issues_count']) patch[field] = repo[field];
      }
      upsertRepo(patch);
    }
  })();
  return rows.length;
}

export async function refreshPeriod(period) {
  if (!['daily', 'weekly', 'monthly'].includes(period)) throw new Error('GitHub Trending supports daily, weekly, or monthly');
  const response = await fetch(`https://github.com/trending?since=${period}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 Amani-Repository-Tracker' }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub Trending ${period}: HTTP ${response.status}`);
  const rows = parseTrending(await response.text());
  if (rows.length < 5) throw new Error(`Incomplete ${period} response (${rows.length} repositories); keeping previous collection`);
  return collect(period, rows);
}

async function main() {
  const period = process.argv[2] || 'all';
  if (!['all', 'daily', 'weekly', 'monthly'].includes(period)) throw new Error('Use all, daily, weekly, or monthly');
  console.log(`Restored known metadata for ${await importKnownMetadata()} repositories`);
  for (const current of period === 'all' ? ['daily', 'weekly', 'monthly'] : [period]) console.log(JSON.stringify(await refreshPeriod(current)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
