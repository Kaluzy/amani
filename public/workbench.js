import { escapeHTML as e, number, date, heading, state, getJSON, repoPath } from './ui.js';
import { prepareLinks } from './deployment.js';
import { savedNames, storageIsPersistent, refreshSaveButtons } from './shortlist.js';

export async function workbench(ctx) {
  const all = await getJSON('/api/repos', ctx.signal);
  const known = new Map(all.map(repo => [repo.full_name, repo]));
  const shared = [...new Set((ctx.url.searchParams.get('compare') || '').split(',').filter(name => known.has(name)))].slice(0, 4);
  let selected = shared.length ? shared : savedNames().filter(name => known.has(name)).slice(0, 4);
  const render = () => {
    const saved = savedNames();
    const names = [...new Set([...saved, ...shared])];
    const rows = names.map(name => known.get(name) || { full_name: name, missing: true });
    const chosen = selected.map(name => known.get(name)).filter(Boolean);
    ctx.main.innerHTML = heading('Your open-source workbench.', 'Keep a shortlist. Compare the facts. Pick a project to explore next.', 'AN AMANI TOOL')
      + `<div class="notice">Saved names stay in this browser—not on our servers. ${storageIsPersistent() ? 'Save up to 24 projects and compare up to four.' : 'Storage is blocked; this shortlist lasts only in this tab.'} Stars measure attention, not quality. Shared comparison links contain public repository names only.</div>`
      + (rows.length ? `<section class="panel"><h2>Choose up to four projects</h2><p class="panel-description">Select the projects you want side by side. Unsave a project to remove it from your browser’s shortlist.</p><div class="workbench-choices">${rows.map(repo => `<div class="workbench-choice"><label><input type="checkbox" data-compare="${e(repo.full_name)}" ${selected.includes(repo.full_name) ? 'checked' : ''} ${repo.missing || (chosen.length >= 4 && !selected.includes(repo.full_name)) ? 'disabled' : ''}><span>${e(repo.full_name)}${repo.missing ? ' · Not in the current catalog' : ''}</span></label><button class="button" data-save-repo="${e(repo.full_name)}" aria-pressed="${saved.includes(repo.full_name)}">${saved.includes(repo.full_name) ? '✓ Saved to workbench' : '＋ Save to workbench'}</button></div>`).join('')}</div></section>` : state('A little focus goes a long way.', 'Use “Save to workbench” on a repository card, then return here to compare your discoveries.'))
      + (chosen.length ? `<section class="panel comparison-panel"><h2>Facts, side by side</h2><p class="panel-description">Latest known public metadata, not endorsements. Missing data is shown as unavailable. Repository metadata may have different collection dates.</p><div class="table-wrap"><table class="data-table comparison-table"><caption class="sr-only">Compare selected public repositories</caption><thead><tr><th scope="col">Signal</th>${chosen.map(repo => `<th scope="col"><a data-nav href="${repoPath(repo.full_name)}">${e(repo.full_name)}</a></th>`).join('')}</tr></thead><tbody>${[
        ['Language', repo => e(repo.language || 'Not recorded')],
        ['Total stars', repo => number(repo.stargazers_count), 'stars'],
        ['Total forks', repo => number(repo.forks_count), 'forks'],
        ['License', repo => e(typeof repo.license === 'string' ? repo.license : repo.license?.name || 'Not recorded')],
        ['Created', repo => e(date(repo.created_at))],
        ['Repository updated', repo => e(date(repo.updated_at))],
        ['Archived', repo => repo.archived ? 'Yes—check maintenance plans' : 'Not marked archived'],
        ['Topics', repo => e(repo.topics.slice(0, 4).join(', ') || 'Not recorded')],
      ].map(([label, value, metric = '']) => `<tr data-metric="${metric}"><th scope="row">${label}</th>${chosen.map(repo => `<td>${value(repo)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="panel-description">On small screens, scroll the table sideways to see every project.</p><div class="comparison-share"><label for="comparisonLink">Share this comparison</label><input id="comparisonLink" readonly aria-describedby="comparisonHelp"><button class="button" id="copyComparison">Copy link</button><span id="comparisonHelp" role="status">Only selected public names are included.</span></div></section>` : '')
      + '<div class="notice">A good next step: <a data-nav href="/guide">read the Amani field guide</a>, inspect licenses and recent maintenance on GitHub, then try a small, reversible experiment.</div>';
    const share = new URL(location.href); share.search = '';
    if (selected.length) share.searchParams.set('compare', selected.join(','));
    const input = document.getElementById('comparisonLink'); if (input) input.value = share.href;
    document.getElementById('copyComparison')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(share.href); document.getElementById('comparisonHelp').textContent = 'Comparison link copied.'; }
      catch { input.focus(); input.select(); document.getElementById('comparisonHelp').textContent = 'Copy the selected address to share this comparison.'; }
    });
    for (const checkbox of ctx.main.querySelectorAll('[data-compare]')) checkbox.addEventListener('change', () => {
      selected = selected.filter(name => name !== checkbox.dataset.compare);
      if (checkbox.checked && selected.length < 4) selected.push(checkbox.dataset.compare);
      history.replaceState(null, '', (() => { const url = new URL(location.href); selected.length ? url.searchParams.set('compare', selected.join(',')) : url.searchParams.delete('compare'); return url; })());
      render();
      ctx.main.querySelector(`[data-compare="${CSS.escape(checkbox.dataset.compare)}"]`)?.focus();
    });
    const region = ctx.main.querySelector('.comparison-panel .table-wrap');
    if (region) { region.tabIndex = 0; region.setAttribute('role', 'region'); region.setAttribute('aria-label', 'Repository comparison; scroll horizontally for more projects'); }
    prepareLinks(ctx.main); refreshSaveButtons();
  };
  render();
  const update = () => { selected = selected.filter(name => savedNames().includes(name) || shared.includes(name)); render(); };
  window.addEventListener('amani:saved-change', update);
  ctx.signal.addEventListener('abort', () => window.removeEventListener('amani:saved-change', update), { once: true });
}
