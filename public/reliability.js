import { escapeHTML as e, heading } from './ui.js';
import { staticMode, repositoryURL } from './deployment.js';

export function freshnessRows(status, now = Date.now()) {
  return ['daily', 'weekly', 'monthly'].map(period => {
    const row = status.periods?.[period], raw = row?.latest;
    const time = raw ? Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z') : NaN;
    const age = now - time;
    return { period, latest: raw, count: row?.count || 0, state: !row?.count || !Number.isFinite(time) || age < -300000 ? 'unavailable' : age > 3 * 3600000 ? 'delayed' : 'current' };
  });
}
export function reliability(ctx) {
  const rows = freshnessRows(ctx.status).map(row => `<tr role="row"><th scope="row" role="rowheader"><a href="/${row.period}" data-nav>${row.period}</a></th><td role="cell" data-label="Projects">${row.count}</td><td role="cell" data-label="Collected (UTC)">${e(row.latest || 'Not recorded')}</td><td role="cell" data-label="Status"><span class="tag">${e(row.state)}</span></td></tr>`).join('');
  ctx.main.innerHTML = heading('Know how fresh your evidence is.', 'Collection age is measured from the source observation—not from when you opened this page.', 'DATA STATUS')
    + `<section class="panel"><h2>Published collection health</h2><div class="table-wrap"><table class="data-table status-table" role="table"><caption>Fresh means collected within the last three hours; it does not mean real-time.</caption><thead><tr><th scope="col">Collection</th><th scope="col">Projects</th><th scope="col">Collected (UTC)</th><th scope="col">Status</th></tr></thead><tbody role="rowgroup">${rows}</tbody></table></div><div class="guide-actions"><button class="button" id="reloadStatus">Reload published data</button><a class="button" href="${repositoryURL}/actions/workflows/pages.yml" target="_blank" rel="noopener noreferrer">View refresh runs ↗</a></div></section><section class="panel"><h2>What a reload does</h2><p>${staticMode ? 'This static website reloads the latest published snapshot. A visitor cannot start a source collection from this button. GitHub Actions schedules can be delayed; the maintainer can manually run the existing publishing workflow.' : 'Reload reads the latest local database. Source collection is managed separately by the operator.'}</p><p>A failed collection must not replace a working snapshot. Release checks reject missing, invalid or stale source collections before publishing. See timestamps before relying on a ranking.</p><p class="panel-description">Repository metadata can be older than collection membership. A recent collection does not verify a project’s license, code activity or safety.</p></section>`;
  document.getElementById('reloadStatus').addEventListener('click', ctx.reload);
}
