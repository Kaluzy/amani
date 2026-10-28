import db from './database.js';

// Counts are cumulative: use the last observation per repository in each bucket.
export function chartData(unit, metric) {
  if (!['month', 'year'].includes(unit) || !['stars', 'forks'].includes(metric)) throw new Error('Invalid chart');
  const format = unit === 'month' ? '%Y-%m' : '%Y';
  const rows = db.prepare(`
    WITH observations AS (
      SELECT strftime('${format}', sh.timestamp) AS bucket, r.language,
        sh.stars, sh.forks,
        ROW_NUMBER() OVER (
          PARTITION BY sh.repo_id, strftime('${format}', sh.timestamp)
          ORDER BY sh.timestamp DESC, sh.id DESC
        ) AS position
      FROM star_history sh JOIN repos r ON r.id = sh.repo_id
      WHERE r.language IS NOT NULL AND r.language != ''
      AND sh.source IN ('github', 'trending-v3', 'github-cache')
    )
    SELECT bucket, language, SUM(stars) AS stars, SUM(forks) AS forks
    FROM observations WHERE position = 1
    GROUP BY bucket, language ORDER BY bucket, language
  `).all();
  const labels = [...new Set(rows.map(row => row.bucket))];
  const languages = [...new Set(rows.map(row => row.language))].slice(0, 6);
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6'];
  return { labels, datasets: languages.map((language, index) => ({
    label: language, borderColor: colors[index],
    data: labels.map(bucket => rows.find(row => row.bucket === bucket && row.language === language)?.[metric] ?? null),
  })) };
}
