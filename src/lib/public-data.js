import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listRepos, trustedHistory } from './catalog.js';
import { validatePublicSeed } from './public-seed.js';

export async function exportPublicSeed(file) {
  const keys = ['full_name','name','description','language','html_url','created_at','updated_at','default_branch','topics','stargazers_count','forks_count','watchers_count','open_issues_count'];
  const repos = listRepos('all');
  const seed = {
    schema: 1, exported_at: new Date().toISOString(),
    repositories: repos.map(repo => ({ ...Object.fromEntries(keys.map(key => [key, repo[key] ?? null])), license: repo.license ? { name: repo.license } : null, size: repo.size_kb, fork: Boolean(repo.is_fork), archived: repo.archived })),
    history: Object.fromEntries(repos.map(repo => [repo.full_name, trustedHistory(repo.id)])),
    collections: Object.fromEntries(['daily','weekly','monthly'].map(period => {
      const rows = listRepos(period);
      return [period, {collected_at: rows[0]?.snapshot_at, items: rows.map(repo => ({full_name: repo.full_name, rank: repo.rank, stars_gained: repo.stars_gained ?? null}))}];
    })),
  };
  validatePublicSeed(seed);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(seed));
  return seed;
}
