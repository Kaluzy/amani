// src/lib/database.js
// SQLite database for historical star tracking

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DB_PATH = process.env.TRENDSHIFT_DB_PATH || fileURLToPath(new URL('../../.trendshift/amani.db', import.meta.url));
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT UNIQUE NOT NULL,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    language TEXT,
    html_url TEXT,
    created_at TEXT,
    updated_at TEXT,
    default_branch TEXT,
    license TEXT,
    topics TEXT, -- JSON array
    size_kb INTEGER,
    is_fork INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    stargazers_count INTEGER DEFAULT 0,
    forks_count INTEGER DEFAULT 0,
    watchers_count INTEGER DEFAULT 0,
    open_issues_count INTEGER DEFAULT 0,
    first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS star_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    stars INTEGER NOT NULL,
    forks INTEGER NOT NULL,
    watchers INTEGER NOT NULL,
    open_issues INTEGER NOT NULL,
    source TEXT DEFAULT 'github', -- 'github', 'trending', 'events'
    FOREIGN KEY (repo_id) REFERENCES repos(id)
  );

  CREATE TABLE IF NOT EXISTS trending_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly'
    language TEXT,
    repo_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    momentum_score REAL,
    stars_gained INTEGER,
    forks_gained INTEGER,
    snapshot_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repos(id)
  );

  CREATE TABLE IF NOT EXISTS github_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    repo_id INTEGER,
    actor_login TEXT,
    payload TEXT, -- JSON
    created_at TEXT NOT NULL,
    processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_star_history_repo ON star_history(repo_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_trending_snapshots_period ON trending_snapshots(period, snapshot_at);
  CREATE INDEX IF NOT EXISTS idx_github_events_repo ON github_events(repo_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_github_events_type ON github_events(type);
`);

export function upsertRepo(repo) {
  const previous = db.prepare('SELECT * FROM repos WHERE full_name = ?').get(repo.full_name);
  const fields = { created_at: 'created_at', updated_at: 'updated_at', default_branch: 'default_branch', description: 'description', language: 'language', size: 'size_kb', stargazers_count: 'stargazers_count', forks_count: 'forks_count', watchers_count: 'watchers_count', open_issues_count: 'open_issues_count' };
  repo = { ...repo };
  for (const [input, stored] of Object.entries(fields)) if (repo[input] == null) repo[input] = previous?.[stored] ?? null;
  if (repo.topics == null) repo.topics = JSON.parse(previous?.topics || '[]');
  if (repo.license === undefined) repo.license = previous?.license ? { name: previous.license } : null;
  if (repo.archived === undefined) repo.archived = Boolean(previous?.is_archived);
  if (repo.fork === undefined) repo.fork = Boolean(previous?.is_fork);
  const stmt = db.prepare(`
    INSERT INTO repos (full_name, owner, name, description, language, html_url, created_at, updated_at, default_branch, license, topics, size_kb, is_fork, is_archived, stargazers_count, forks_count, watchers_count, open_issues_count, last_updated)
    VALUES (@full_name, @owner, @name, @description, @language, @html_url, @created_at, @updated_at, @default_branch, @license, @topics, @size_kb, @is_fork, @is_archived, @stargazers_count, @forks_count, @watchers_count, @open_issues_count, datetime('now'))
    ON CONFLICT(full_name) DO UPDATE SET
      description = excluded.description,
      language = excluded.language,
      html_url = excluded.html_url,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      default_branch = excluded.default_branch,
      license = excluded.license,
      topics = excluded.topics,
      size_kb = excluded.size_kb,
      is_fork = excluded.is_fork,
      is_archived = excluded.is_archived,
      stargazers_count = excluded.stargazers_count,
      forks_count = excluded.forks_count,
      watchers_count = excluded.watchers_count,
      open_issues_count = excluded.open_issues_count,
      last_updated = datetime('now')
  `);
  
  stmt.run({
    full_name: repo.full_name,
    owner: repo.owner?.login || repo.full_name.split('/')[0],
    name: repo.name || repo.full_name.split('/')[1],
    description: repo.description,
    language: repo.language,
    html_url: repo.html_url || repo.url || `https://github.com/${repo.full_name}`,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    default_branch: repo.default_branch,
    license: repo.license?.name,
    topics: JSON.stringify(repo.topics || []),
    size_kb: repo.size,
    is_fork: repo.fork ? 1 : 0,
    is_archived: repo.archived ? 1 : 0,
    stargazers_count: repo.stargazers_count || 0,
    forks_count: repo.forks_count || 0,
    watchers_count: repo.watchers_count || 0,
    open_issues_count: repo.open_issues_count || 0,
  });
  
  return getRepoId(repo.full_name);
}

export function getRepoId(fullName) {
  const row = db.prepare('SELECT id FROM repos WHERE full_name = ?').get(fullName);
  return row?.id;
}

export function recordStarSnapshot(repoId, stars, forks, watchers, openIssues, source = 'github') {
  const stmt = db.prepare(`
    INSERT INTO star_history (repo_id, timestamp, stars, forks, watchers, open_issues, source)
    VALUES (?, datetime('now'), ?, ?, ?, ?, ?)
  `);
  return stmt.run(repoId, stars, forks, watchers, openIssues, source);
}

export function recordTrendingSnapshot(period, language, repoId, rank, momentumScore, starsGained, forksGained) {
  const stmt = db.prepare(`
    INSERT INTO trending_snapshots (period, language, repo_id, rank, momentum_score, stars_gained, forks_gained, snapshot_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  return stmt.run(period, language, repoId, rank, momentumScore, starsGained, forksGained);
}

export function getStarVelocity(repoId, hours = 24) {
  const stmt = db.prepare(`
    SELECT 
      (MAX(stars) - MIN(stars)) as stars_gained,
      (MAX(forks) - MIN(forks)) as forks_gained,
      COUNT(*) as samples,
      MIN(timestamp) as start_time,
      MAX(timestamp) as end_time
    FROM star_history
    WHERE repo_id = ? AND timestamp >= datetime('now', ?)
  `);
  return stmt.get(repoId, `-${hours} hours`);
}

export function getTrendingHistory(period, language, limit = 100) {
  let query = `
    SELECT 
      r.full_name, r.owner, r.name, r.language, r.description, r.html_url,
      r.stargazers_count, r.forks_count, r.created_at, r.is_archived,
      ts.rank, ts.momentum_score, ts.stars_gained, ts.forks_gained,
      ts.snapshot_at
    FROM trending_snapshots ts
    JOIN repos r ON r.id = ts.repo_id
    WHERE ts.period = ?
      AND ts.id = (
        SELECT latest.id FROM trending_snapshots latest
        WHERE latest.period = ts.period AND latest.repo_id = ts.repo_id
        ORDER BY latest.snapshot_at DESC, latest.id DESC LIMIT 1
      )
  `;
  const params = [period];
  
  if (language) {
    query += ' AND ts.language = ?';
    params.push(language);
  }
  
  query += ' ORDER BY ts.rank ASC, r.full_name ASC LIMIT ?';
  params.push(limit);
  
  return db.prepare(query).all(...params);
}

export function getRepoStarHistory(repoId, days = 30) {
  return db.prepare(`
    SELECT timestamp, stars, forks, watchers
    FROM star_history
    WHERE repo_id = ? AND timestamp >= date('now', ?)
    ORDER BY timestamp ASC
  `).all(repoId, `-${days} days`);
}

export function getTopMovers(period = 'daily', limit = 20) {
  return db.prepare(`
    SELECT 
      r.full_name, r.language, r.description, r.html_url, r.stargazers_count,
      ts.rank, ts.momentum_score, ts.stars_gained, ts.forks_gained,
      LAG(ts.rank) OVER (PARTITION BY ts.repo_id ORDER BY ts.snapshot_at) as prev_rank
    FROM trending_snapshots ts
    JOIN repos r ON r.id = ts.repo_id
    WHERE ts.period = ? AND ts.snapshot_at >= datetime('now', '-2 days')
    ORDER BY ts.snapshot_at DESC, ts.rank ASC
    LIMIT ?
  `).all(period, limit);
}

export function getDataQualityMetrics() {
  return {
    totalRepos: db.prepare('SELECT COUNT(*) as c FROM repos').get().c,
    totalSnapshots: db.prepare('SELECT COUNT(*) as c FROM star_history').get().c,
    totalTrending: db.prepare('SELECT COUNT(*) as c FROM trending_snapshots').get().c,
    totalEvents: db.prepare('SELECT COUNT(*) as c FROM github_events').get().c,
    oldestSnapshot: db.prepare('SELECT MIN(timestamp) as t FROM star_history').get()?.t,
    latestSnapshot: db.prepare('SELECT MAX(timestamp) as t FROM star_history').get()?.t,
  };
}

export function recordGithubEvent(event) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO github_events (event_id, type, repo_id, actor_login, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const repoId = event.repo ? getRepoId(event.repo.name) : null;
  return stmt.run(event.id, event.type, repoId, event.actor?.login, JSON.stringify(event.payload), event.created_at);
}

export default db;
