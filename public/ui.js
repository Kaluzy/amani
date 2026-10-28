import { dataURL, staticMode } from './deployment.js';
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const number = value => value == null ? '—' : Number(value).toLocaleString();
export const compact = value => value == null ? '—' : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value));
export const repoPath = name => '/repositories/' + name.split('/').map(encodeURIComponent).join('/');
export const date = value => value ? new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not recorded';
export const relative = value => {
  if (!value) return 'No collection yet';
  const age = Math.max(0, Date.now() - Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z'));
  return age < 60000 ? 'Just collected' : age < 3600000 ? `${Math.floor(age / 60000)}m ago` : age < 86400000 ? `${Math.floor(age / 3600000)}h ago` : date(value);
};
export const languages = { JavaScript: '#d2b944', TypeScript: '#669bbf', Python: '#7699a9', Rust: '#bd8c6b', Go: '#6eb3ba', Java: '#bd8c6b', Shell: '#9cba75', HTML: '#d59174', CSS: '#a290c2', 'C++': '#ba8db0', C: '#829ebc', Ruby: '#ba7979', PHP: '#9a99bf' };
export function language(value) { return `<span class="language"><span class="language-dot" style="--language-color:${languages[value] || '#91a381'}"></span>${escapeHTML(value || 'Unspecified')}</span>`; }
export function heading(title, description, eyebrow = 'YOUR OPEN-SOURCE WORKSPACE', action = '') {
  return `<div class="page-heading"><div><div class="eyebrow"><span class="status-dot"></span>${escapeHTML(eyebrow)}</div><h1>${escapeHTML(title)}</h1><p>${escapeHTML(description)}</p></div>${action ? `<div class="heading-actions">${action}</div>` : ''}</div>`;
}
export function metrics(data) {
  return `<section class="metrics" aria-label="Collection summary">${[
    ['Tracked repositories', data.totalRepos, '◫', 'Across your open-source collection'],
    ['Total stars', data.totalStars, '☆', 'Latest known repository totals', 'stars'],
    ['Languages', data.totalLanguages, '⌘', 'Discover your next ecosystem'],
    ['Recorded observations', data.totalSnapshots, '↗', 'Building a clearer view over time'],
  ].map(([label, value, icon, note, metric = '']) => `<div class="metric" data-metric="${metric}"><div class="metric-label">${label}<span class="metric-icon" aria-hidden="true">${icon}</span></div><div class="metric-value">${number(value)}</div><div class="metric-note">${note}</div></div>`).join('')}</section>`;
}
export function card(repo, index, period = 'daily') {
  const fullName = repo.full_name;
  const [owner, ...rest] = fullName.split('/');
  const gains = repo.stars_gained ?? repo.stars_today;
  const gainLabel = { daily: 'Stars gained today', weekly: 'Stars gained this week', monthly: 'Stars gained this month', yearly: 'Observed star growth', all: 'Star growth' }[period] || 'Star growth';
  const rankLabel = period === 'yearly' ? 'Observed growth' : period[0].toUpperCase() + period.slice(1);
  const ranked = period !== 'all' && Number.isInteger(repo.rank) && repo.rank > 0;
  const backgrounds = ['#e9ede3', '#e7eaf1', '#f1ece1', '#e5eeeb', '#efe7e8', '#e9e8f0'];
  return `<article class="repo-card" data-repository="${escapeHTML(fullName)}">
    <div class="repo-card-top"><span class="repo-avatar" style="--avatar-bg:${backgrounds[index % backgrounds.length]}" aria-hidden="true">${escapeHTML(owner.slice(0, 2))}</span>${ranked ? `<span class="repo-rank">${escapeHTML(rankLabel)} rank #${number(repo.rank)}</span>` : '<span class="repo-context">Tracked repository</span>'}</div>
    <div class="repo-identity"><div class="repo-owner">${escapeHTML(owner)}</div><h3 class="repo-name"><a data-nav href="${repoPath(fullName)}">${escapeHTML(rest.join('/'))}</a></h3></div>
    <p class="repo-description">${escapeHTML(repo.description || 'No description has been recorded for this repository yet.')}</p>
    <div class="repo-language-row"><span class="repo-field-label">Language</span>${language(repo.language)}${repo.archived ? '<span class="tag">Archived</span>' : ''}</div>
    <div class="repo-stat-block"><dl class="repo-stats"><div data-metric="stars"><dt><span class="stat-symbol" aria-hidden="true">☆</span>Total stars</dt><dd>${repo.stargazers_count == null ? '<span class="stat-unknown">Not recorded</span>' : number(repo.stargazers_count)}</dd></div><div data-metric="forks"><dt><span class="stat-symbol" aria-hidden="true">⑂</span>Total forks</dt><dd>${repo.forks_count == null ? '<span class="stat-unknown">Not recorded</span>' : number(repo.forks_count)}</dd></div></dl>
    <div class="repo-growth ${gains < 0 ? 'growth-negative' : ''}"><div><span class="growth-label">${gainLabel}</span><strong>${gains == null ? '<span class="stat-unknown">Not recorded</span>' : `${gains > 0 ? '+' : ''}${number(gains)}`}</strong></div><p>${gains == null ? 'More observations are needed.' : period === 'yearly' ? 'Change across available observation dates.' : 'Reported for this period by GitHub.'}</p></div>
    <p class="repo-data-note">${repo.snapshot_at ? `Collection: ${escapeHTML(relative(repo.snapshot_at))}` : 'Latest known repository totals.'}</p></div>
    ${Array.isArray(repo.topics) && repo.topics.length ? `<div class="repo-topics" aria-label="Topics">${repo.topics.slice(0, 3).map(topic => `<a class="tag" data-nav href="/topics/${encodeURIComponent(topic)}">${escapeHTML(topic)}</a>`).join('')}${repo.topics.length > 3 ? `<a class="tag" data-nav href="${repoPath(fullName)}">+${repo.topics.length - 3} topics</a>` : ''}</div>` : ''}
    <div class="repo-actions"><a class="repo-details-link" data-nav href="${repoPath(fullName)}">View details <span aria-hidden="true">→</span></a><a class="repo-github-link" href="https://github.com/${fullName.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(fullName)} on GitHub (new tab)">GitHub <span aria-hidden="true">↗</span></a></div>
  </article>`;
}
export function state(title, message, { error = false, retry = false } = {}) {
  return `<section class="${error ? 'error-state' : 'empty-state'}"><span class="state-icon" aria-hidden="true">${error ? '!' : '⌕'}</span><h2>${escapeHTML(title)}</h2><p>${escapeHTML(message)}</p>${retry ? '<button class="button button-dark" id="retryPage">Try again</button>' : '<a class="button" href="/github-trending" data-nav>Explore the collection <span aria-hidden="true">↗</span></a>'}</section>`;
}
export function periodTabs(current) { return `<nav class="period-tabs" aria-label="Trending period">${['daily', 'weekly', 'monthly', 'yearly'].map(period => `<a data-nav href="/${period}" class="${period === current ? 'active' : ''}" ${period === current ? 'aria-current="page"' : ''}>${period[0].toUpperCase() + period.slice(1)}</a>`).join('')}</nav>`; }
export async function getJSON(url, signal, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(dataURL(url), { signal: controller.signal, ...(staticMode ? { cache: 'no-store' } : {}) });
    let data;
    try { data = await response.json(); } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error('The server returned an unexpected response. Please try again.');
    }
    if (!response.ok) throw new Error(data.error || 'Unable to load data. Please try again.');
    controller.signal.throwIfAborted();
    return data;
  } catch (error) {
    if (timedOut) throw new Error('The data request timed out. Please try again.');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
