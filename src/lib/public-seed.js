const validName = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) && !value.split('/').some(part => part === '.' || part === '..');
const count = value => Number.isSafeInteger(value) && value >= 0;
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z'));
export function validatePublicSeed(seed) {
  if (seed?.schema !== 1 || !Array.isArray(seed.repositories) || !seed.repositories.length || !seed.history || !seed.collections) throw new Error('Invalid public seed structure');
  const names = new Set();
  for (const repo of seed.repositories) {
    if (!validName(repo.full_name) || names.has(repo.full_name)) throw new Error('Invalid or duplicate public repository');
    names.add(repo.full_name);
    for (const field of ['name','description','language','html_url','created_at','updated_at','default_branch']) if (repo[field] != null && typeof repo[field] !== 'string') throw new Error('Invalid public metadata type');
    for (const field of ['created_at','updated_at']) if (repo[field] != null && !validDate(repo[field])) throw new Error('Invalid public metadata date');
    if (repo.license != null && (typeof repo.license !== 'object' || typeof repo.license.name !== 'string')) throw new Error('Invalid public license metadata');
    for (const field of ['stargazers_count', 'forks_count', 'watchers_count', 'open_issues_count']) if (repo[field] != null && !count(repo[field])) throw new Error('Invalid public repository count');
    if (!Array.isArray(repo.topics) || repo.topics.some(topic => typeof topic !== 'string' || !/^[a-z0-9][a-z0-9-]{0,49}$/.test(topic))) throw new Error('Invalid public repository topic');
  }
  for (const [name, history] of Object.entries(seed.history)) {
    if (!names.has(name) || !Array.isArray(history)) throw new Error('Invalid observation owner');
    for (const row of history) if (!validDate(row.timestamp) || !count(row.stars) || !count(row.forks) || (row.watchers != null && !count(row.watchers))) throw new Error('Invalid public observation');
  }
  for (const [period, collection] of Object.entries(seed.collections)) {
    if (!['daily', 'weekly', 'monthly'].includes(period) || !Array.isArray(collection.items)) throw new Error('Invalid public collection');
    if (collection.items.length && !validDate(collection.collected_at)) throw new Error('Invalid collection timestamp');
    const seen = new Set();
    for (const [index, row] of collection.items.entries()) {
      if (!names.has(row.full_name) || seen.has(row.full_name) || row.rank !== index + 1 || (row.stars_gained != null && !count(row.stars_gained))) throw new Error('Invalid collection membership');
      seen.add(row.full_name);
    }
  }
  return seed;
}
