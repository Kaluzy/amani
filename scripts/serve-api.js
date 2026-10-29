import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import db, { getDataQualityMetrics } from '../src/lib/database.js';
import { chartData } from '../src/lib/chart-data.js';
import { listRepos, normalize, trustedHistory, coverage, periods } from '../src/lib/catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = '3.1.0';
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    next();
  });
  const metrics = () => ({ ...getDataQualityMetrics(),
    totalStars: db.prepare('SELECT COALESCE(SUM(stargazers_count),0) n FROM repos').get().n,
    totalForks: db.prepare('SELECT COALESCE(SUM(forks_count),0) n FROM repos').get().n,
    totalLanguages: db.prepare("SELECT COUNT(DISTINCT language) n FROM repos WHERE language IS NOT NULL AND language != ''").get().n,
  });
  const languages = () => {
    const groups = new Map();
    for (const repo of listRepos('all')) {
      if (!repo.language) continue;
      if (!groups.has(repo.language)) groups.set(repo.language, {language:repo.language,repos:0,totalStars:null,totalForks:null,avgStars:null,known:0});
      const row = groups.get(repo.language); row.repos++;
      if (repo.stargazers_count != null) { row.known++; row.totalStars=(row.totalStars??0)+repo.stargazers_count; row.totalForks=(row.totalForks??0)+repo.forks_count; }
    }
    return [...groups.values()].map(({known,...row}) => ({...row,avgStars:known?Math.floor(row.totalStars/known):null})).sort((a,b)=>b.repos-a.repos||a.language.localeCompare(b.language));
  };
  const charts = () => ({ monthlyStars: chartData('month', 'stars'), monthlyForks: chartData('month', 'forks'), yearlyStars: chartData('year', 'stars'), yearlyForks: chartData('year', 'forks') });
  app.get('/health', (req, res) => res.json({ status: 'ok', version, data: metrics(), timestamp: new Date().toISOString() }));
  app.get('/api/status', (req, res) => res.json({ version, metrics: metrics(), periods: coverage(), collected_at: new Date().toISOString() }));
  app.get('/api/repos/detail/:owner/:repo', (req, res) => {
    const row = db.prepare('SELECT * FROM repos WHERE full_name = ? COLLATE NOCASE').get(`${req.params.owner}/${req.params.repo}`);
    if (!row) return res.status(404).json({ error: 'Repository not found' });
    const history = trustedHistory(row.id);
    const velocity = {};
    for (const [label, hours] of [['24h', 24], ['7d', 168], ['30d', 720]]) {
      const samples = history.filter(item => Date.now() - Date.parse(item.timestamp.replace(' ', 'T') + 'Z') <= hours * 3600000);
      velocity[label] = { samples: samples.length, stars_gained: samples.length > 1 ? samples.at(-1).stars - samples[0].stars : null };
    }
    res.json({ ...normalize(row), size: row.size_kb, license: row.license ? { name: row.license } : null,
      ranked: Object.fromEntries(periods.map(period => [period, listRepos(period).find(repo => repo.id === row.id)]).filter(([, value]) => value)),
      velocity, star_history: history,
    });
  });
  const catalog = req => {
    const period = req.params.period || req.query.period || 'all';
    if (!['all', ...periods].includes(period)) return null;
    let items = listRepos(period);
    if (req.query.language) items = items.filter(repo => repo.language === req.query.language);
    if (req.query.topic) items = items.filter(repo => repo.topics.includes(req.query.topic));
    if (req.query.q) {
      const query = String(req.query.q).toLowerCase();
      items = items.filter(repo => `${repo.full_name} ${repo.description || ''} ${repo.topics.join(' ')}`.toLowerCase().includes(query));
    }
    const limit = req.query.limit == null ? items.length : Math.min(1000, Math.max(1, Number.parseInt(req.query.limit, 10) || 1000));
    return items.slice(0, limit);
  };
  app.get('/api/repos', (req, res) => {
    const items = catalog(req);
    return items ? res.json(items) : res.status(400).json({ error: 'Unknown period' });
  });
  app.get('/api/repos/:period', (req, res) => {
    const items = catalog(req);
    return items ? res.json(items) : res.status(400).json({ error: 'Unknown period' });
  });
  app.get('/api/stats', (req, res) => res.json(metrics()));
  app.get('/api/stats/languages', (req, res) => res.json(languages()));
  app.get('/api/stats/charts', (req, res) => res.json(charts()));
  app.get('/api/insights', (req, res) => {
    const all = listRepos('all');
    const daily = listRepos('daily');
    res.json({ most_starred: all.slice(0, 6), fastest_growing: [...daily].sort((a, b) => (b.stars_gained || 0) - (a.stars_gained || 0)).slice(0, 6),
      recently_created: all.filter(repo => repo.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6), languages: languages().slice(0, 5) });
  });
  app.get('/api/live-mentions', (req, res) => res.json(listRepos('daily').map(repo => ({ ...repo, repo: repo.full_name, url: repo.html_url, stars: repo.stargazers_count, timestamp: repo.snapshot_at, mentioned_by: 'GitHub Trending' }))));
  app.get('/api/topics', (req, res) => {
    const topics = new Map();
    for (const repo of listRepos('all')) for (const topic of new Set(repo.topics.filter(topic => typeof topic === 'string'))) topics.set(topic, (topics.get(topic) || 0) + 1);
    res.json([...topics].map(([slug, count]) => ({ slug, name: slug, count })).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug)));
  });
  app.get('/api/topics/:slug/repos', (req, res) => res.json(listRepos('all').filter(repo => repo.topics.includes(req.params.slug))));
  const attempts = new Map();
  app.post('/api/submissions', (req, res) => {
    let fullName = String(req.body?.repository || '').trim();
    if (fullName.startsWith('http')) {
      try { const url = new URL(fullName); if (url.hostname !== 'github.com' || url.protocol !== 'https:' || url.username || url.password) throw new Error(); fullName = url.pathname.replace(/^\/|\/$/g, ''); }
      catch { return res.status(400).json({ error: 'Enter a public github.com repository URL or owner/repository.' }); }
    }
    fullName = fullName.replace(/\.git$/, '');
    if (['.', '..'].includes(fullName.split('/')[1])) return res.status(400).json({ error: 'Enter a repository name, not a dot path.' });
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_.-]{1,100}$/.test(fullName)) return res.status(400).json({ error: 'Use owner/repository, for example microsoft/vscode.' });
    const existing = db.prepare('SELECT * FROM submissions WHERE full_name = ? COLLATE NOCASE').get(fullName);
    if (existing) return res.json(existing);
    const key = req.ip;
    const now = Date.now();
    for (const [ip, record] of attempts) if (now - record.start > 60000) attempts.delete(ip);
    const record = attempts.get(key) || { start: now, count: 0 };
    if (record.count >= 5) return res.status(429).json({ error: 'Please wait a minute before submitting more repositories.' });
    record.count++; attempts.set(key, record);
    const info = db.prepare('INSERT INTO submissions (full_name) VALUES (?)').run(fullName);
    res.status(201).json(db.prepare('SELECT * FROM submissions WHERE id = ?').get(info.lastInsertRowid));
  });
  app.get('/vendor/chart.js', (req, res) => res.sendFile(path.join(root, 'node_modules/chart.js/dist/chart.umd.js')));
  const aliases = { '/index.html': '/', '/live-mentions': '/live', '/github-trending-repositories': '/github-trending', '/repositories': '/github-trending' };
  for (const page of ['daily', 'weekly', 'monthly', 'yearly', 'stats', 'insights', 'topics', 'github-trending']) aliases[`/${page}.html`] = `/${page}`;
  aliases['/live-mentions.html'] = '/live';
  aliases['/repo.html'] = '/github-trending';
  aliases['/topic.html'] = '/topics';
  app.get(Object.keys(aliases), (req, res) => res.redirect(302, aliases[req.path]));
  const routes = ['/', '/daily', '/weekly', '/monthly', '/yearly', '/stats', '/insights', '/live', '/topics', '/topics/:slug', '/github-trending', '/repositories/:owner/:repo', '/workbench', '/guide', '/submit', '/about', '/privacy', '/terms', '/contact'];
  app.get(routes, (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(root, 'public/shell.html')); });
  app.use(express.static(path.join(root, 'public'), { index: false, maxAge: 0 }));
  app.use((req, res) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Endpoint not found' }) : res.status(404).sendFile(path.join(root, 'public/shell.html')));
  app.use((error, req, res, next) => { console.error(error.message); res.status(error.status || 500).json({ error: error.status === 400 ? 'Invalid request body' : 'Request failed. Please try again.' }); });
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createApp().listen(Number(process.env.PORT || 3002), '127.0.0.1', () => console.log(`Amani running at http://127.0.0.1:${server.address().port} (v${version})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
