import { escapeHTML as e, heading, getJSON, card, date, number, state } from './ui.js';
import { prepareLinks, staticMode } from './deployment.js';
import { collectionTeasers } from './collections.js';

export async function briefing(ctx) {
  const repos = await getJSON('/api/repos/weekly', ctx.signal), collection = ctx.status.periods.weekly;
  ctx.main.innerHTML = heading('Your weekly open-source briefing.', 'Five projects from the latest recorded weekly collection, plus a practical next step. No inbox required.', 'COME BACK WITH A PURPOSE')
    + `<section class="panel briefing-intro"><h2>Attention is a starting point—not a verdict.</h2><p>Collected ${e(date(collection?.latest))}. This is GitHub’s reported weekly ordering, not a hand-tested recommendation list or a calendar-week archive. Amani refreshes the briefing when a new collection is published.</p><div class="guide-actions">${staticMode ? '<a class="button button-dark" href="/feeds/weekly.xml" target="_blank" rel="noopener">Subscribe with RSS ↗</a>' : ''}<a class="button" href="/workbench" data-nav>Check your saved projects →</a><a class="button" href="/weekly" data-nav>Full weekly collection →</a></div><p class="panel-description">RSS works in a feed reader. Email subscriptions and background alerts are not enabled.</p></section>`
    + (repos.length ? `<div class="section-heading"><h2>Five signals to investigate</h2><span class="count-badge">${number(Math.min(5, repos.length))}</span></div><div class="repo-grid">${repos.slice(0, 5).map((repo, index) => card(repo, index, 'weekly')).join('')}</div>` : state('No weekly collection yet.', 'A briefing appears after a successful weekly collection.'))
    + '<section class="panel briefing-checklist"><h2>Turn one discovery into a decision</h2><ol class="guide-steps"><li>Save a project that solves a problem you actually have.</li><li>Compare its recorded facts and open its documentation, license and maintenance evidence.</li><li>Try a reversible experiment. Return to the workbench to check changes since your baseline.</li></ol></section>' + collectionTeasers();
  prepareLinks(ctx.main);
}
