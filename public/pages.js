import { escapeHTML as e, number, compact, date, relative, language, repoPath, heading, metrics, card, state, periodTabs, getJSON } from './ui.js';
import { staticMode, repositoryURL, prepareLinks } from './deployment.js';
import { refreshSaveButtons } from './shortlist.js';

const titleCase = value => value[0].toUpperCase() + value.slice(1);
let charts = [];
export function dispose() { charts.forEach(chart => chart.destroy()); charts = []; }
function chart(id, data, type = 'line') {
  const canvas = document.getElementById(id);
  if (!canvas || !data.labels.length || !data.datasets.length) return;
  if (!window.Chart) { canvas.replaceWith(Object.assign(document.createElement('p'), { textContent: 'Chart unavailable. Recorded values are shown in the tables.' })); return; }
  charts.push(new window.Chart(canvas, { type, data: {
    ...data, datasets: data.datasets.map((row, i) => ({ ...row, borderColor: ['#5a8054', '#8d9d73', '#a4b389', '#c1aa7c', '#879da6', '#ae95ac'][i % 6], backgroundColor: ['#91ac7a', '#b7c59d', '#d1d8ba', '#d9c6a4', '#b5c8ce', '#d0bdd0'][i % 6], borderWidth: 2, tension: .25, pointRadius: 3, fill: false })) }, options: {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 6, font: { size: 10 }, padding: 18 } } },
    scales: { x: { grid: { display: false }, ticks: { color: '#89967f', font: { size: 10 } } }, y: { beginAtZero: true, grid: { color: '#eff2e8' }, border: { display: false }, ticks: { color: '#89967f', font: { size: 10 }, callback: compact } } },
  } }));
}
function chartPanel(title, description, id, data) {
  return `<section class="panel"><h2>${e(title)}</h2><p class="panel-description">${e(description)}</p>${data.labels.length ? `<div class="chart-container"><canvas id="${id}" role="img" aria-label="${e(title)}"></canvas></div>` : '<div class="notice">No verified historical observations yet. Charts appear as collections are recorded.</div>'}</section>`;
}
function repoGrid(items, period, limit = 6) { return `<div class="repo-grid">${items.slice(0, limit).map((repo, i) => card(repo, i, period)).join('')}</div>`; }

export async function repositories(ctx, { period = 'daily', overview = false, topic = null } = {}) {
  const endpoint = topic ? '/api/topics/' + encodeURIComponent(topic) + '/repos' : period === 'all' ? '/api/repos' : '/api/repos/' + period;
  const repos = await getJSON(endpoint, ctx.signal);
  const coverage = ctx.status.periods[period];
  const title = topic ? `#${topic}` : overview ? 'Find your next building block.' : period === 'all' ? 'The open-source collection.' : `${titleCase(period)} discoveries.`;
  const descriptions = {
    daily: 'Find the projects catching the community’s attention today.',
    weekly: 'A wider lens on the projects gaining traction this week.',
    monthly: 'Explore the projects shaping open source this month.',
    yearly: 'Follow long-term progress through the history we have actually recorded.',
    all: 'Every tracked project in one place. Find something worth building with.',
  };
  ctx.main.innerHTML = heading(title, topic ? 'Discover tracked repositories sharing this topic.' : descriptions[period], topic ? 'BROWSE BY TOPIC' : overview ? 'A LITTLE CURIOSITY GOES A LONG WAY' : 'EXPLORE OPEN SOURCE', `<span class="updated-label"><span class="status-dot"></span>${e(relative(coverage?.latest))}</span><button id="refreshData" class="button" aria-label="Refresh page data">↻ <span>Refresh</span></button>`)
    + (overview ? `<section class="intro-banner"><div><div class="eyebrow">FIND. COMPARE. BUILD.</div><h2>Turn a good discovery<br>into a clear decision.</h2><p>Save the projects that fit your work. Compare the evidence on your personal workbench, then make a small, informed next step.</p><a class="button button-link" href="/workbench" data-nav>Open your workbench <span aria-hidden="true">◇</span></a><a class="button button-link" href="/guide" data-nav>Read the field guide ↗</a></div><div class="intro-ornament" aria-hidden="true"><span>◇</span></div></section>${metrics(ctx.status.metrics)}` : '')
    + `<div class="section-heading"><div class="section-label"><h2>${topic ? 'Repositories' : period === 'all' ? 'All repositories' : 'Trending repositories'}</h2><span class="count-badge">${repos.length}</span></div>${overview ? '<a class="button button-link" href="/daily" data-nav>View daily trending ↗</a>' : ''}</div>`
    + (!topic && period !== 'all' ? periodTabs(period) : '')
    + (period === 'yearly' ? `<div class="notice">Annual view: ${e(coverage.message)} This is a view of our recorded history, not an official GitHub yearly ranking.</div>` : '')
    + `<div class="toolbar"><div class="filters"><label class="filter-field" for="languageSelect">Language<select id="languageSelect"><option value="">All languages</option>${[...new Set(repos.map(repo => repo.language).filter(Boolean))].sort().map(lang => `<option value="${e(lang)}">${e(lang)}</option>`).join('')}</select></label><label class="filter-field" for="sortSelect">Sort by<select id="sortSelect"><option value="rank">${period === 'all' || topic ? 'Default order' : 'Trending rank'}</option><option value="stars">Most stars</option><option value="velocity">Star growth</option><option value="forks">Most forks</option><option value="new">Newest</option></select></label></div><div class="filters"><span id="resultsCount" class="results-count"></span><div class="view-options" aria-label="Repository layout"><button id="gridView" aria-label="Grid view" aria-pressed="true">▦</button><button id="listView" aria-label="List view" aria-pressed="false">☷</button></div></div></div><div id="repoGrid" class="repo-grid" aria-live="polite"></div><div id="pagination" class="pagination"></div>`;
  let page = 1;
  const pageSize = 12;
  let view = ['grid', 'list'].includes(ctx.url.searchParams.get('view')) ? ctx.url.searchParams.get('view') : 'grid';
  const lang = document.getElementById('languageSelect');
  const sort = document.getElementById('sortSelect');
  lang.value = ctx.url.searchParams.get('language') || '';
  sort.value = ctx.url.searchParams.get('sort') || 'rank';
  if (!sort.value) sort.value = 'rank';
  const render = () => {
    const sortNotes = { rank: period === 'all' || topic ? 'Default collection order.' : 'Ordered by trending rank · plum rank badges.', stars: 'Ordered by total stars · amber totals are underlined.', forks: 'Ordered by total forks · plum totals are underlined.', velocity: 'Ordered by star growth · green growth panels are emphasized.', new: 'Ordered by repository creation date · newest first.' };
    sort.closest('label').dataset.sort = sort.value;
    let caption = document.getElementById('sortCaption');
    if (!caption) {
      caption = document.createElement('p'); caption.id = 'sortCaption'; caption.className = 'sort-caption';
      caption.setAttribute('role', 'status');
      document.getElementById('repoGrid').before(caption);
      sort.setAttribute('aria-describedby', 'sortCaption');
    }
    caption.textContent = sortNotes[sort.value] || sortNotes.rank;
    const query = document.getElementById('globalSearch').value.trim().toLowerCase();
    let rows = repos.filter(repo => (!lang.value || repo.language === lang.value) && (!query || `${repo.full_name} ${repo.description || ''} ${repo.topics.join(' ')}`.toLowerCase().includes(query)));
    if (sort.value === 'stars') rows.sort((a, b) => (b.stargazers_count ?? -Infinity) - (a.stargazers_count ?? -Infinity));
    if (sort.value === 'forks') rows.sort((a, b) => (b.forks_count ?? -Infinity) - (a.forks_count ?? -Infinity));
    if (sort.value === 'velocity') rows.sort((a, b) => (b.stars_gained ?? -Infinity) - (a.stars_gained ?? -Infinity));
    if (sort.value === 'new') rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const grid = document.getElementById('repoGrid');
    grid.dataset.sort = sort.value;
    grid.classList.toggle('list-view', view === 'list');
    grid.innerHTML = rows.length ? rows.slice(0, page * pageSize).map((repo, i) => card(repo, i, period)).join('') : '';
    if (!rows.length) grid.insertAdjacentHTML('afterend', `<div id="emptyResults">${state(repos.length ? 'No matches this time.' : period === 'yearly' ? 'A longer story is taking shape.' : 'No collection recorded yet.', repos.length ? 'Try a different search or language to explore more projects.' : period === 'yearly' ? 'Annual growth needs observations on at least two different dates. Explore Daily, Weekly, or Monthly while the history builds.' : 'This period has not been collected yet. Other collections remain available.')}</div>`);
    document.getElementById('resultsCount').textContent = `${rows.length} ${rows.length === 1 ? 'repository' : 'repositories'}`;
    document.getElementById('pagination').innerHTML = rows.length > pageSize ? `<span>Showing ${Math.min(rows.length, page * pageSize)} of ${rows.length}</span>${rows.length > page * pageSize ? '<button id="loadMoreBtn" class="button">Load more repositories <span aria-hidden="true">↓</span></button>' : ''}` : '';
    document.getElementById('loadMoreBtn')?.addEventListener('click', () => { page++; document.getElementById('emptyResults')?.remove(); render(); });
    for (const mode of ['grid', 'list']) document.getElementById(mode + 'View').setAttribute('aria-pressed', String(view === mode));
    const url = new URL(location.href);
    for (const [key, value] of [['q', query], ['language', lang.value], ['sort', sort.value === 'rank' ? '' : sort.value], ['view', view === 'grid' ? '' : view]]) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    history.replaceState(null, '', url);
    prepareLinks(ctx.main);
    refreshSaveButtons(ctx.main);
    document.getElementById('announcements').textContent = `${rows.length} repositories found`;
  };
  const reset = () => { page = 1; document.getElementById('emptyResults')?.remove(); render(); };
  lang.addEventListener('change', reset); sort.addEventListener('change', reset);
  for (const mode of ['grid', 'list']) document.getElementById(mode + 'View').addEventListener('click', () => { view = mode; reset(); });
  ctx.setSearch(reset);
  document.getElementById('refreshData').addEventListener('click', ctx.reload);
  render();
}

export async function statistics(ctx) {
  const [data, languages] = await Promise.all([getJSON('/api/stats/charts', ctx.signal), getJSON('/api/stats/languages', ctx.signal)]);
  ctx.main.innerHTML = heading('A little perspective.', 'Understand the languages, projects, and patterns across your collection.', 'COLLECTION STATISTICS') + metrics(ctx.status.metrics)
    + '<div class="notice">These totals describe the tracked collection, not all of GitHub. Historical charts use one verified observation per repository per month or year.</div>'
    + `<div class="two-column">${chartPanel('Stars over time', 'Monthly recorded totals, grouped by language.', 'monthlyStarsChart', data.monthlyStars)}${chartPanel('Forks over time', 'Monthly recorded totals, grouped by language.', 'monthlyForksChart', data.monthlyForks)}${chartPanel('Yearly star observations', 'Recorded yearly totals. Missing years are not estimated.', 'yearlyStarsChart', data.yearlyStars)}${chartPanel('Yearly fork observations', 'Recorded yearly totals. Missing years are not estimated.', 'yearlyForksChart', data.yearlyForks)}</div>`
    + `<section class="panel" style="margin-top:22px"><h2>The language landscape</h2><p class="panel-description">Latest known counts for every tracked language.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Language</th><th class="number">Repositories</th><th class="number">Stars</th><th class="number">Forks</th><th class="number">Average stars</th></tr></thead><tbody id="languageTable">${languages.map(row => `<tr><td>${language(row.language)}</td><td class="number">${number(row.repos)}</td><td class="number">${number(row.totalStars)}</td><td class="number">${number(row.totalForks)}</td><td class="number">${number(row.avgStars)}</td></tr>`).join('') || '<tr><td colspan="5">Language data appears after the first collection.</td></tr>'}</tbody></table></div></section>`;
  for (const key of ['monthlyStars', 'monthlyForks', 'yearlyStars', 'yearlyForks']) chart(key + 'Chart', data[key]);
}

export async function insights(ctx) {
  const data = await getJSON('/api/insights', ctx.signal);
  const first = data.languages[0];
  ctx.main.innerHTML = heading('Read between the repos.', 'A few useful starting points, drawn directly from your collection.', 'SIGNALS & DISCOVERIES')
    + `<div class="insight-summary"><div class="eyebrow">THE COLLECTION AT A GLANCE</div><p>${first ? `<strong>${e(first.language)}</strong> is the most represented language here, with <strong>${number(first.repos)} repositories</strong>. ` : ''}Explore the fastest-growing projects, the most starred repositories, and the newest additions below. All observations reflect this workspace’s data coverage.</p></div>`
    + [ ['Today’s momentum', 'The highest reported daily star gains.', data.fastest_growing, 'daily'], ['Community favorites', 'The most starred projects in this collection.', data.most_starred, 'all'], ['Fresh perspectives', 'The newest repositories by their recorded creation date.', data.recently_created, 'all'] ].map(([title, description, rows, period]) => `<section><div class="section-heading"><div><h2>${title}</h2><p>${description}</p></div><a href="/${period === 'all' ? 'github-trending' : period}" data-nav class="button button-link">Explore all ↗</a></div>${rows.length ? repoGrid(rows, period) : state('More signals are on the way.', 'Verified observations will appear here when collections are recorded.')}</section>`).join('');
}

export async function topics(ctx) {
  const rows = await getJSON('/api/topics', ctx.signal);
  ctx.main.innerHTML = heading('Follow your curiosity.', 'Discover open-source communities through the topics their maintainers choose.', 'EXPLORE BY TOPIC')
    + '<div class="toolbar"><label class="sr-only" for="topicSearch">Filter topics</label><input class="search-inline" id="topicSearch" type="search" placeholder="Find a topic, e.g. machine-learning"><span class="results-count" id="topicCount"></span></div><div id="topicsList" class="topics-grid"></div><div id="topicPagination" class="pagination"></div>';
  let visible = 36;
  const render = () => {
    const q = document.getElementById('topicSearch').value.toLowerCase();
    const filtered = rows.filter(row => row.name.toLowerCase().includes(q));
    document.getElementById('topicCount').textContent = `${filtered.length} topics`;
    document.getElementById('topicsList').innerHTML = filtered.slice(0, visible).map(row => `<a class="topic-card" data-nav href="/topics/${encodeURIComponent(row.slug)}"><span>${number(row.count)} ${row.count === 1 ? 'repository' : 'repositories'} <span aria-hidden="true">↗</span></span><h2>${e(row.name)}</h2><p>Explore the projects</p></a>`).join('');
    document.getElementById('topicPagination').innerHTML = filtered.length > visible ? '<button class="button" id="moreTopics">Explore more topics ↓</button>' : '';
    prepareLinks(ctx.main);
    document.getElementById('moreTopics')?.addEventListener('click', () => { visible += 36; render(); });
    document.getElementById('emptyTopics')?.remove();
    if (!filtered.length) document.getElementById('topicsList').insertAdjacentHTML('afterend', `<div id="emptyTopics">${state('No topics found.', rows.length ? 'Try another topic name.' : 'Topics appear when repository metadata has been collected.')}</div>`);
    prepareLinks(ctx.main);
  };
  document.getElementById('topicSearch').addEventListener('input', () => { visible = 36; render(); }); render();
}

export async function activity(ctx) {
  const rows = await getJSON('/api/live-mentions', ctx.signal);
  ctx.main.innerHTML = heading('What’s catching on.', 'A timestamped feed from the latest recorded GitHub Trending collection.', 'TRENDING ACTIVITY', '<button class="button" id="refreshActivity">↻ Refresh feed</button>')
    + '<div class="notice">This feed reflects collected GitHub activity. Social media mentions are not connected.</div>'
    + (rows.length ? `<div class="activity-list">${rows.map(row => `<article class="activity-item"><span class="repo-avatar" aria-hidden="true">${e(row.owner.login.slice(0, 2))}</span><div><h2><a data-nav href="${repoPath(row.full_name)}">${e(row.full_name)}</a></h2><p>${row.stars_gained == null ? 'Featured on GitHub Trending' : `<strong>+${number(row.stars_gained)}</strong> stars today`} <span aria-hidden="true">·</span> ${e(row.language || 'Unspecified language')}</p></div><time>${e(relative(row.timestamp))}</time></article>`).join('')}</div>` : state('Your feed is taking shape.', 'Activity will appear after the first successful Daily collection.'));
  document.getElementById('refreshActivity').addEventListener('click', ctx.reload);
}

export async function detail(ctx, owner, name) {
  const repo = await getJSON('/api/repos/detail/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name), ctx.signal);
  document.title = `${repo.full_name} — Amani`;
  const history = repo.star_history;
  const hasHistory = history.length > 0;
  const chartData = { labels: history.map(row => date(row.timestamp)), datasets: [{ label: 'Recorded stars', data: history.map(row => row.stars) }] };
  ctx.main.innerHTML = `<a data-nav class="back-link" href="/github-trending">← Back to the collection</a><section class="detail-heading"><div class="eyebrow">REPOSITORY PROFILE</div><div class="detail-identity"><span class="repo-avatar" aria-hidden="true">${e(owner.slice(0, 2))}</span><div><div class="repo-owner">${e(owner)}</div><h1>${e(name)}</h1></div></div><p class="detail-description">${e(repo.description || 'This repository has no public description yet.')}</p><div class="detail-links"><a class="button button-dark" href="${e(repo.html_url)}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>${language(repo.language)}${repo.archived ? '<span class="tag">Archived</span>' : ''}</div><div class="tags">${repo.topics.slice(0, 15).map(topic => `<a data-nav class="tag" href="/topics/${encodeURIComponent(topic)}">${e(topic)}</a>`).join('')}</div></section>`
    + `<div class="metrics">${[['Stars',repo.stargazers_count,'stars'],['Forks',repo.forks_count,'forks'],['Open issues',repo.open_issues_count,''],['24h observed growth',repo.velocity['24h'].stars_gained,'']].map(([label,value,metric]) => `<div class="metric" data-metric="${metric}"><div class="metric-label">${label}</div><div class="metric-value">${number(value)}</div><div class="metric-note">${value == null ? 'More observations needed' : 'Latest recorded data'}</div></div>`).join('')}</div>`
    + `<div class="detail-layout"><div class="stack">${chartPanel('A story in stars', 'Verified star observations. A single point is not a growth trend.', 'repoHistoryChart', chartData)}${hasHistory ? `<section class="panel"><h2>Recorded observations</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th class="number">Stars</th><th class="number">Forks</th></tr></thead><tbody>${history.slice(-30).map(row => `<tr><td>${e(date(row.timestamp))}</td><td class="number">${number(row.stars)}</td><td class="number">${number(row.forks)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}</div><div class="stack"><section class="panel"><h2>Project details</h2><dl class="definition-list">${[['Maintainer',owner],['License',repo.license?.name || 'Not specified'],['Created',date(repo.created_at)],['Last updated',date(repo.updated_at)],['Default branch',repo.default_branch || 'Not recorded']].map(([label,value])=>`<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl></section><section class="panel"><h2>In the spotlight</h2><dl class="definition-list">${Object.entries(repo.ranked).map(([period,row])=>`<div><dt><a data-nav href="/${period}">${titleCase(period)}</a></dt><dd>#${number(row.rank)}</dd></div>`).join('') || '<p class="panel-description">No current ranking recorded.</p>'}</dl><p class="history-caption">Rankings refer to the latest collection for each period.</p></section></div></div>`;
  if (hasHistory) chart('repoHistoryChart', chartData);
}

export async function submit(ctx) {
  if (staticMode) {
    ctx.main.innerHTML = heading('Found something worth sharing?', 'Suggest a public repository through GitHub Issues.', 'SUBMIT A REPOSITORY')
      + `<section class="panel"><h2>Share your discovery on GitHub.</h2><p class="panel-description">This public website is hosted on GitHub Pages and cannot save form submissions. Open a repository suggestion on GitHub instead; your suggestion is public and needs a GitHub account. No credentials are collected by this website.</p><p style="margin-top:20px"><a class="button button-dark" href="${e(repositoryURL)}/issues/new?template=repository.yml" target="_blank" rel="noopener noreferrer">Suggest on GitHub ↗</a></p></section>`;
    return;
  }
  ctx.main.innerHTML = `<div class="form-page">${heading('Found something worth sharing?', 'Suggest a public GitHub repository for this workspace’s collection.', 'SUBMIT A REPOSITORY')}<section class="panel"><h2>A good discovery deserves company.</h2><p class="panel-description">Share the repository link below. Suggestions are saved for review; they do not automatically enter the rankings.</p><form id="submitForm"><div class="form-field"><label for="repositoryURL">GitHub repository</label><input id="repositoryURL" name="repository" placeholder="https://github.com/owner/repository" required maxlength="240" autocomplete="url" aria-describedby="submitHelp"><small id="submitHelp">A public github.com URL or owner/repository. No account credentials needed.</small></div><button class="button button-dark" type="submit">Submit for review <span aria-hidden="true">↗</span></button><div id="submitMessage" class="form-message" role="status"></div></form></section></div>`;
  document.getElementById('submitForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    const message = document.getElementById('submitMessage');
    button.disabled = true; message.className = 'form-message'; message.textContent = 'Saving your suggestion…';
    try {
      const response = await fetch('/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repository: document.getElementById('repositoryURL').value }), signal: ctx.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save this suggestion.');
      message.textContent = `${data.full_name} is saved for review. Thank you for sharing it.`;
      event.target.reset();
    } catch (error) { message.classList.add('error-text'); message.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

export function information(ctx, page) {
  const pages = {
    about: ['A clearer view of open source.', 'Amani brings together public repository information and recorded GitHub Trending collections.', `<h2>Where the data comes from</h2><p>Daily, Weekly, and Monthly rankings reflect the latest successful collection of GitHub’s public Trending pages. Repository totals, descriptions, and topics come from public GitHub metadata. These are observations of a changing source, not a live connection to every GitHub event.</p><h2>What “yearly” means</h2><p>GitHub does not provide a yearly Trending collection. The Yearly view ranks the change between the first and last verified observations we recorded within the last 365 days. At least two separate observation dates are required. A new workspace needs time to build this history; we do not invent missing values.</p><h2>How to read the numbers</h2><p>Star gains on period cards are reported for that period. Charts show the last recorded repository totals in each month or year, rather than adding repeated cumulative counts. Collection totals describe the projects tracked here and are not GitHub-wide statistics.</p><h2>Freshness and coverage</h2><p>Collection timestamps appear on period pages. Refresh reloads the data already available in this workspace. New source collections are recorded by the workspace maintainer. Activity represents GitHub Trending observations; social media mentions are not connected.</p>`],
    privacy: ['Your browsing, kept simple.', 'How this workspace handles information.', '<h2>Browsing</h2><p>This application does not include advertising or third-party analytics scripts. Essential assets and charts are served by this workspace. Search and filters are represented in the page URL; sharing that URL shares those search terms.</p><h2>Repository suggestions</h2><p>Submitting a repository stores its public name, review status, and submission time. No email address or GitHub credentials are requested. The workspace host may keep standard access logs.</p><h2>External links</h2><p>GitHub links open an external website, which has its own privacy practices. Contact the person who operates this workspace for questions about its hosting or stored suggestions.</p>'],
    terms: ['A useful starting point.', 'Guidelines for using this workspace.', '<h2>Public information</h2><p>Repository data is provided for discovery and may be delayed, incomplete, or changed by its source. A ranking is not an endorsement or a guarantee of quality or safety.</p><h2>Open-source licenses</h2><p>Check each repository’s current license and documentation on GitHub before using its code. Amani does not change the terms set by project maintainers.</p><h2>Suggestions</h2><p>Submit public repositories only. Suggestions are stored for review and are not guaranteed inclusion.</p>'],
    contact: ['Keep the conversation going.', 'This is a privately operated repository workspace.', '<h2>Share a discovery</h2><p>Use <a href="/submit" data-nav>Submit repository</a> to suggest a public project. Your suggestion is saved for the workspace maintainer to review.</p><h2>Report a problem</h2><p>Contact the person who shared this workspace with you. Include the page address, what you expected, and what happened. No public support address has been configured for this installation.</p>'],
  };
  const content = pages[page];
  if (staticMode) {
    if (page === 'about') content[2] += '<h2>Public website updates</h2><p>This GitHub Pages site serves timestamped public data snapshots. An hourly GitHub Actions workflow collects new data and redeploys the site; scheduled runs can be delayed. Refresh reloads the most recently published snapshot, not a real-time GitHub stream.</p>';
    if (page === 'privacy') content[2] = '<h2>Public data only</h2><p>Amani publishes public repository metadata and recorded observations. It does not include private workspace databases, credentials or advertising/analytics scripts.</p><h2>Your personal workbench</h2><p>Saving a project stores its public repository name in local storage on this browser. No account is required, and this shortlist is not sent to our servers. Unsave projects to remove them, or clear site storage in your browser. If storage is blocked, saves last only in the current tab. A comparison link contains only the public names you select to share; anyone with that link can see those selections.</p><h2>Hosting and suggestions</h2><p>GitHub Pages hosts this site and may keep access logs under <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub’s privacy policy</a>. Suggestions are public GitHub Issues and require a GitHub account; this website does not collect credentials or save submissions. Search filters appear in the URL when shared. There are no tracking cookies or paid placements in this release.</p>';
    if (page === 'contact') content[2] = `<h2>Suggestions and problems</h2><p>Use <a href="${e(repositoryURL)}/issues" target="_blank" rel="noopener noreferrer">GitHub Issues</a> to suggest repositories or report problems. Include the page URL, expected result and what happened. Issues are public; never include passwords or private information.</p>`;
    if (page === 'terms') content[2] += '<p>On this public site, repository suggestions are submitted as public GitHub Issues for review, not stored in a website database.</p>';
  }
  if (page === 'about') content[2] += '<h2>What makes this Amani</h2><p>Amani is an independent field guide—not an official GitHub product. Our personal workbench, shareable factual comparisons and original evaluation guide help turn public discovery signals into a practical decision. Stars are attention, not a quality rating. We do not sell rankings, and there are currently no ads, affiliate links or sponsored placements.</p><p>Public repository descriptions and metadata belong to their respective sources. Third-party software license notices are preserved. A listing is not an endorsement or affiliation.</p>';
  if (page === 'privacy' && !staticMode) content[2] += '<h2>Personal workbench</h2><p>Saved public repository names are stored in this browser’s local storage, not in a visitor account. Clear site storage or unsave projects to remove them. Shared comparison links include selected public repository names.</p>';
  ctx.main.innerHTML = `<article class="prose">${heading(content[0], content[1], page.toUpperCase())}${content[2]}</article>`;
}
