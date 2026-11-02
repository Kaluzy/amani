// Only the current browser stores baselines; no accounts, background jobs or notifications.
const KEY = 'amani:watchlist:v1';
const valid = name => typeof name === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name) && !name.split('/').some(part => part === '.' || part === '..');
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
let memory = {}, persistent = true;
export function readBaseline() {
  if (!persistent) return structuredClone(memory);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    memory = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [name, row] of Object.entries(raw).slice(0, 24)) {
      if (!valid(name) || !row || typeof row !== 'object' || !Number.isFinite(Date.parse(row.checkedAt))) continue;
      memory[name] = { stars: count(row.stars), forks: count(row.forks), checkedAt: row.checkedAt, archived: typeof row.archived === 'boolean' ? row.archived : null };
    }
  } catch { persistent = false; }
  return structuredClone(memory);
}
export function watchChanges(repos, baseline) {
  return repos.map(repo => {
    const before = baseline[repo.full_name];
    return { name: repo.full_name, before,
      stars: before && before.stars != null && count(repo.stargazers_count) != null ? repo.stargazers_count - before.stars : null,
      forks: before && before.forks != null && count(repo.forks_count) != null ? repo.forks_count - before.forks : null,
      archiveChanged: Boolean(before && before.archived != null && before.archived !== repo.archived),
    };
  });
}
export function acknowledge(repos, now = new Date().toISOString()) {
  const baseline = {};
  for (const repo of repos.slice(0, 24)) if (valid(repo.full_name)) baseline[repo.full_name] = { stars: count(repo.stargazers_count), forks: count(repo.forks_count), archived: typeof repo.archived === 'boolean' ? repo.archived : null, checkedAt: now };
  memory = baseline;
  try { localStorage.setItem(KEY, JSON.stringify(baseline)); persistent = true; } catch { persistent = false; }
  return persistent;
}
export function forgetBaseline(name) {
  const baseline = readBaseline();
  if (name) delete baseline[name]; else for (const key of Object.keys(baseline)) delete baseline[key];
  memory = baseline;
  try { localStorage.setItem(KEY, JSON.stringify(baseline)); } catch { persistent = false; }
}
