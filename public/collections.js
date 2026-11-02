import { guides, projectNotes, reviewed, githubURL } from './editorial.js';
import { escapeHTML as e, heading, number, repoPath, date, getJSON, state } from './ui.js';
import { prepareLinks } from './deployment.js';
import { refreshSaveButtons } from './shortlist.js';

export function collectionTeasers() {
  return `<section class="collection-section" aria-labelledby="collectionHeading"><div class="section-heading"><div><p class="eyebrow">START WITH YOUR GOAL</p><h2 id="collectionHeading">Less browsing. Better decisions.</h2></div><a class="button" href="/collections" data-nav>All decision guides →</a></div><div class="collection-grid">${guides.map((guide, index) => `<a class="panel collection-card" data-nav href="/collections/${guide.slug}"><span class="collection-number">0${index + 1} / ${e(guide.category)}</span><h3>${e(guide.title)}</h3><p>${e(guide.description)}</p><span class="collection-cta">Read the guide →</span></a>`).join('')}</div></section>`;
}
export async function collections(ctx, slug) {
  const guide = guides.find(item => item.slug === slug);
  if (!slug) { ctx.main.innerHTML = collectionsIndexHTML(); return; }
  if (!guide) { ctx.main.innerHTML = state('This guide does not exist.', 'Choose one of the current Amani collections.'); return; }
  const all = await getJSON('/api/repos', ctx.signal);
  ctx.main.innerHTML = decisionGuideHTML(guide, all);
  prepareLinks(ctx.main); refreshSaveButtons(ctx.main);
}
export function collectionsIndexHTML() {
  return heading('Start with a job to do.', 'Original decision guides: who each tool fits, what to watch for, and a small experiment before you commit.', 'AMANI COLLECTIONS') + collectionTeasers() + '<div class="notice">Editorial guidance, not paid rankings or hands-on certification. Some projects are source-available under restricted terms. Always check the current license and documentation.</div>';
}
export function decisionGuideHTML(guide, all) {
  const known = new Map(all.map(repo => [repo.full_name, repo]));
  const tracked = guide.names.filter(name => known.has(name));
  return `<article class="decision-guide">${heading(guide.title, guide.description, guide.category)}<div class="guide-intro panel"><p><strong>For:</strong> ${e(guide.audience)}</p><p><strong>When to skip it:</strong> ${e(guide.skip)}</p><p class="panel-description">Amani editorial judgment · sources reviewed ${reviewed}. These notes are not installation benchmarks, security audits or legal advice.</p></div><section class="panel"><h2>A sensible starting sequence</h2><ol class="guide-steps">${guide.steps.map(step => `<li>${e(step)}</li>`).join('')}</ol></section><div class="decision-projects">${guide.names.map(name => {
    const note = projectNotes[name], repo = known.get(name), url = githubURL(name);
    return `<section class="panel decision-project"><div class="decision-project-heading"><div><p class="eyebrow">${e(note.role)}</p><h2>${e(name)}</h2></div><span class="tag">${e(note.effort)} setup · editorial</span></div><dl class="decision-facts"><div><dt>Good fit</dt><dd>${e(note.fit)}</dd></div><div><dt>Deployment shape</dt><dd>${e(note.setup)}</dd></div><div><dt>Watch out</dt><dd>${e(note.caution)}</dd></div><div><dt>Try this first</dt><dd>${e(note.experiment)}</dd></div></dl><p class="panel-description">${repo ? `Recorded stars: ${number(repo.stargazers_count)} · Recorded license: ${e(typeof repo.license === 'string' ? repo.license : repo.license?.name || 'Not recorded')} · Catalog observed: ${e(date(repo.last_updated))} (not license verification)` : 'Not in the current catalog. No totals or license have been estimated.'}</p><div class="guide-actions"><a class="button" href="${url}#readme" target="_blank" rel="noopener noreferrer">Source & documentation ↗</a>${repo ? `<a class="button" href="${repoPath(name)}" data-nav>Recorded evidence →</a><button class="button" data-save-repo="${e(name)}">Save to workbench</button>` : ''}</div></section>`;
  }).join('')}</div><section class="panel"><h2>Your go / no-go question</h2><p>${e(guide.check)}</p><p class="panel-description">These projects may solve different parts of a stack. Comparing facts does not imply feature equivalence.</p><div class="guide-actions">${tracked.length ? `<a class="button button-dark" href="/workbench?compare=${encodeURIComponent(tracked.join(','))}" data-nav>Compare recorded facts →</a>` : ''}<a class="button" data-nav href="/collections">Other guides</a></div></section></article>`;
}
