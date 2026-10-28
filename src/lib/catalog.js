import db, { upsertRepo, recordStarSnapshot, recordTrendingSnapshot, getTrendingHistory } from './database.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS collection_runs (
    id INTEGER PRIMARY KEY, period TEXT NOT NULL, source TEXT NOT NULL,
    collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS collection_entries (
    run_id INTEGER NOT NULL REFERENCES collection_runs(id),
    repo_id INTEGER NOT NULL REFERENCES repos(id), rank INTEGER NOT NULL,
    stars_gained INTEGER, PRIMARY KEY (run_id, repo_id)
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY, full_name TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_collection_period ON collection_runs(period, id DESC);
`);

export const periods = ['daily', 'weekly', 'monthly', 'yearly'];
export function normalize(row) {
  let topics = [];
  try { topics = JSON.parse(row.topics || '[]'); } catch { /* Legacy invalid metadata. */ }
  const owner = typeof row.owner === 'string' ? row.owner : row.owner?.login || row.full_name.split('/')[0];
  const unverified = row.stargazers_count === 0
    && !db.prepare(`SELECT 1 FROM star_history WHERE repo_id = ? AND source IN ('github', 'trending-v3', 'github-cache') LIMIT 1`).get(row.id);
  return { ...row, name: row.name || row.full_name.split('/')[1],
    stargazers_count: unverified ? null : row.stargazers_count,
    forks_count: unverified ? null : row.forks_count,
    watchers_count: unverified ? null : row.watchers_count,
    open_issues_count: unverified ? null : row.open_issues_count,
    created_at: unverified ? null : row.created_at,
    updated_at: unverified ? null : row.updated_at,
    default_branch: unverified ? null : row.default_branch,
    owner: { login: owner, html_url: `https://github.com/${encodeURIComponent(owner)}` },
    html_url: `https://github.com/${row.full_name.split('/').map(encodeURIComponent).join('/')}`,
    topics: Array.isArray(topics) ? topics : [], archived: Boolean(row.is_archived),
    stars_today: row.stars_gained ?? null,
    momentum_score: row.stars_gained ?? null,
  };
}

export function collect(period, repos, source = 'github-trending') {
  if (!periods.slice(0, 3).includes(period)) throw new Error('Unsupported collection period');
  if (!repos.length) throw new Error('Empty collection refused');
  return db.transaction(() => {
    const run = db.prepare('INSERT INTO collection_runs (period, source) VALUES (?, ?)').run(period, source).lastInsertRowid;
    const names = new Set();
    for (const [index, repo] of repos.entries()) {
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.full_name) || names.has(repo.full_name)) throw new Error('Invalid or duplicate repository');
      names.add(repo.full_name);
      for (const field of ['stargazers_count', 'forks_count']) if (!Number.isSafeInteger(repo[field]) || repo[field] < 0) throw new Error(`Invalid ${field}`);
      if (repo.stars_today != null && (!Number.isSafeInteger(repo.stars_today) || repo.stars_today < 0)) throw new Error('Invalid stars_today');
      const id = upsertRepo(repo);
      const rank = index + 1;
      db.prepare('INSERT INTO collection_entries (run_id, repo_id, rank, stars_gained) VALUES (?, ?, ?, ?)').run(run, id, rank, repo.stars_today ?? null);
      recordTrendingSnapshot(period, repo.language || null, id, rank, repo.stars_today ?? null, repo.stars_today ?? null, null);
      const saved = db.prepare('SELECT * FROM repos WHERE id = ?').get(id);
      recordStarSnapshot(id, saved.stargazers_count, saved.forks_count, saved.watchers_count, saved.open_issues_count, 'trending-v3');
    }
    return { period, count: repos.length, run: Number(run) };
  })();
}

export function listRepos(period = 'all') {
  if (period === 'all') return db.prepare('SELECT * FROM repos ORDER BY stargazers_count DESC, full_name').all().map(normalize);
  if (period === 'yearly') return yearlyRepos();
  const run = db.prepare('SELECT * FROM collection_runs WHERE period = ? ORDER BY id DESC LIMIT 1').get(period);
  if (run) return db.prepare(`SELECT r.*, ce.rank, ce.stars_gained, cr.collected_at AS snapshot_at
    FROM collection_entries ce JOIN repos r ON r.id = ce.repo_id
    JOIN collection_runs cr ON cr.id = ce.run_id WHERE ce.run_id = ? ORDER BY ce.rank`).all(run.id).map(normalize);
  return getTrendingHistory(period, null, 1000).map(row => normalize({ ...db.prepare('SELECT * FROM repos WHERE full_name = ?').get(row.full_name), ...row }));
}

export function trustedHistory(id, days = 365) {
  return db.prepare(`SELECT timestamp, stars, forks, watchers FROM star_history
    WHERE repo_id = ? AND timestamp >= datetime('now', ?)
    AND source IN ('github', 'trending-v3', 'github-cache')
    ORDER BY timestamp, id`).all(id, `-${days} days`);
}

function yearlyRepos() {
  const rows = db.prepare(`WITH observations AS (
    SELECT sh.*, ROW_NUMBER() OVER (PARTITION BY repo_id ORDER BY timestamp, id) AS first,
      ROW_NUMBER() OVER (PARTITION BY repo_id ORDER BY timestamp DESC, id DESC) AS last
    FROM star_history sh WHERE timestamp >= datetime('now', '-365 days')
    AND source IN ('github', 'trending-v3', 'github-cache')
  ), growth AS (
    SELECT repo_id, MAX(CASE WHEN last=1 THEN stars END)-MAX(CASE WHEN first=1 THEN stars END) AS stars_gained,
      MIN(timestamp) AS start_time, MAX(timestamp) AS snapshot_at, COUNT(DISTINCT date(timestamp)) AS days
    FROM observations GROUP BY repo_id HAVING days >= 2
  ) SELECT r.*, growth.stars_gained, growth.start_time, growth.snapshot_at, growth.days
    FROM growth JOIN repos r ON r.id = growth.repo_id ORDER BY stars_gained DESC, r.full_name`).all();
  return rows.map((row, index) => normalize({ ...row, rank: index + 1 }));
}

export function coverage() {
  return Object.fromEntries(periods.map(period => {
    const rows = listRepos(period);
    const latest = rows.map(r => r.snapshot_at).filter(Boolean).sort().at(-1) || null;
    return [period, { count: rows.length, latest, source: period === 'yearly' ? 'observed-growth' : 'github-trending',
      message: period === 'yearly' ? 'Growth across available observations in the last 365 days. At least two observation dates are required.' : 'Latest recorded GitHub Trending collection.' }];
  }));
}
