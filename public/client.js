import { escapeHTML, getJSON, state, freshnessNotice } from './ui.js';
import { repositories, statistics, insights, topics, activity, detail, submit, information, dispose } from './pages.js';
import { routeURL, sitePath, prepareLinks } from './deployment.js';
import { workbench } from './workbench.js';
import { guide } from './guide.js';
import { savedNames, setSaved, refreshSaveButtons } from './shortlist.js';

const navigation = [
  ['/', 'Overview', '◫'], ['/daily', 'Daily trending', '↗'], ['/weekly', 'Weekly trending', '▥'], ['/monthly', 'Monthly trending', '▤'], ['/yearly', 'Yearly growth', '◷'],
  ['/stats', 'Statistics', '▥'], ['/insights', 'Insights', '✧'], ['/live', 'Activity', '⌁'], ['/topics', 'Topics', '⊞'], ['/github-trending', 'All repositories', '⌘'],
  ['/workbench', 'My workbench', '◇'], ['/guide', 'Field guide', '⌁'],
];
const main = document.getElementById('mainContent');
let activeController;
let searchHandler;
let cleanup;
let sequence = 0;
const mobile = matchMedia('(max-width: 900px)');
document.getElementById('sidebar').inert = mobile.matches;
document.getElementById('mainNav').innerHTML = navigation.map(([url,label,icon], index) => `${index === 5 ? '<div class="nav-separator"></div><p class="nav-label">DISCOVER MORE</p>' : ''}<a class="nav-link" data-nav href="${url}"><span class="nav-icon" aria-hidden="true">${icon}</span>${label}${url === '/live' ? '<span class="nav-tag">FEED</span>' : ''}</a>`).join('');
const savedLink = document.querySelector('#mainNav a[href="/workbench"]');
savedLink.insertAdjacentHTML('beforeend', '<span class="nav-tag" id="savedCount" aria-label="Saved repository count">0</span>');
document.addEventListener('click', event => {
  const button = event.target.closest('[data-save-repo]');
  if (!button) return;
  const result = setSaved(button.dataset.saveRepo, !savedNames().includes(button.dataset.saveRepo));
  refreshSaveButtons();
  document.getElementById('announcements').textContent = result.message;
});
window.addEventListener('amani:saved-change', () => refreshSaveButtons());
window.addEventListener('storage', event => {
  if (event.key === null || event.key === 'amani:workbench:v1') window.dispatchEvent(new CustomEvent('amani:saved-change'));
});
function closeMenu() {
  const focusInMenu = document.getElementById('sidebar').contains(document.activeElement);
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar').inert = mobile.matches;
  document.getElementById('navBackdrop').hidden = true;
  document.getElementById('menuToggle').setAttribute('aria-expanded', 'false');
  if (focusInMenu && mobile.matches) document.getElementById('menuToggle').focus();
}
document.getElementById('menuToggle').addEventListener('click', () => {
  const open = document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar').inert = !open && mobile.matches;
  document.getElementById('navBackdrop').hidden = !open;
  document.getElementById('menuToggle').setAttribute('aria-expanded', String(open));
});
mobile.addEventListener('change', closeMenu);
document.getElementById('navBackdrop').addEventListener('click', closeMenu);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeMenu(); document.getElementById('menuToggle').focus(); }
  if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); document.getElementById('globalSearch').focus(); }
});
async function render() {
  clearTimeout(debounce);
  const id = ++sequence;
  activeController?.abort(); dispose(); cleanup?.(); cleanup = null; searchHandler = null;
  activeController = new AbortController();
  const url = routeURL();
  const currentPath = url.pathname.replace(/\/$/, '') || '/';
  let parts;
  try { parts = currentPath.split('/').filter(Boolean).map(decodeURIComponent); }
  catch {
    main.innerHTML = state('This address is not valid.', 'The address contains an incomplete or invalid encoded character. Explore the collection to continue.', { error: true });
    main.removeAttribute('aria-busy');
    document.getElementById('breadcrumb').textContent = 'Invalid address';
    return;
  }
  const activePath = currentPath.startsWith('/topics/') ? '/topics' : currentPath.startsWith('/repositories/') ? '/github-trending' : currentPath;
  for (const link of document.querySelectorAll('#mainNav a')) {
    const active = routeURL(link.href).pathname === activePath;
    link.classList.toggle('active', active);
    active ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
  }
  const label = navigation.find(([path]) => path === activePath)?.[1] || ({ submit: 'Submit repository', about: 'About the data', privacy: 'Privacy', terms: 'Terms', contact: 'Contact' })[parts[0]] || 'Page not found';
  document.getElementById('breadcrumb').textContent = label;
  document.title = `${label} — Amani`;
  document.getElementById('globalSearch').value = url.searchParams.get('q') || '';
  main.innerHTML = '<div class="page-loading loading-dots" role="status">Finding your next discovery</div>';
  main.setAttribute('aria-busy', 'true');
  try {
    const status = await getJSON('/api/status', activeController.signal);
    if (id !== sequence) return;
    document.getElementById('sidebarCount').textContent = `${Number(status.metrics.totalRepos).toLocaleString()} repositories tracked`;
    const ctx = { main, url, status, signal: activeController.signal, reload: render, setSearch: fn => { searchHandler = fn; } };
    if (currentPath === '/') await repositories(ctx, { overview: true });
    else if (currentPath === '/workbench') await workbench(ctx);
    else if (currentPath === '/guide') guide(ctx);
    else if (['daily','weekly','monthly','yearly'].includes(parts[0]) && parts.length === 1) await repositories(ctx, { period: parts[0] });
    else if (currentPath === '/github-trending') await repositories(ctx, { period: 'all' });
    else if (currentPath === '/stats') await statistics(ctx);
    else if (currentPath === '/insights') await insights(ctx);
    else if (currentPath === '/topics') await topics(ctx);
    else if (parts[0] === 'topics' && parts.length === 2) await repositories(ctx, { period: 'all', topic: parts[1] });
    else if (currentPath === '/live') { await activity(ctx); const interval = setInterval(() => { if (!document.hidden) render(); }, 60000); cleanup = () => clearInterval(interval); }
    else if (parts[0] === 'repositories' && parts.length === 3) await detail(ctx, parts[1], parts[2]);
    else if (currentPath === '/submit') await submit(ctx);
    else if (['about','privacy','terms','contact'].includes(parts[0]) && parts.length === 1) information(ctx, parts[0]);
    else main.innerHTML = state('This path leads somewhere new.', 'The page you requested does not exist. Explore the collection to continue.');
    main.insertAdjacentHTML('afterbegin', freshnessNotice(status));
  } catch (error) {
    if (error.name === 'AbortError' || id !== sequence) return;
    main.innerHTML = state('We couldn’t load this page.', error.message, { error: true, retry: true });
    document.getElementById('retryPage').addEventListener('click', render);
  } finally { if (id === sequence) {
    prepareLinks(); refreshSaveButtons(); main.removeAttribute('aria-busy');
    const canonical = new URL(location.href); canonical.search = ''; canonical.hash = '';
    if (!canonical.pathname.endsWith('/')) canonical.pathname += '/';
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical.href);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical.href);
  } }
}
export function navigate(url) { history.pushState(null, '', sitePath(url)); closeMenu(); window.scrollTo(0, 0); render(); main.focus({ preventScroll: true }); }
document.addEventListener('click', event => {
  const anchor = event.target.closest('a[data-nav]');
  if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target) return;
  event.preventDefault(); navigate(anchor.href);
});
document.getElementById('searchForm').addEventListener('submit', event => {
  event.preventDefault(); const query = document.getElementById('globalSearch').value.trim();
  navigate('/github-trending' + (query ? '?q=' + encodeURIComponent(query) : ''));
});
let debounce;
document.getElementById('globalSearch').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => searchHandler?.(), 120); });
window.addEventListener('popstate', () => { closeMenu(); render(); });
render();
