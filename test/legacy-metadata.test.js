import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('unverified legacy metadata stays unknown until a genuine zero observation exists', async t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'amani-legacy-'));
  process.env.TRENDSHIFT_DB_PATH = path.join(temp, 'test.db');
  const { default: db, upsertRepo, recordStarSnapshot } = await import('../src/lib/database.js');
  const { normalize } = await import('../src/lib/catalog.js');
  t.after(() => { db.close(); rmSync(temp, { recursive: true, force: true }); });
  const id = upsertRepo({ full_name: 'example/legacy', name: 'legacy', created_at: '2026-10-27', stargazers_count: 0, forks_count: 0, open_issues_count: 0 });
  const read = () => db.prepare('SELECT * FROM repos WHERE id = ?').get(id);
  const before = normalize(read());
  assert.equal(before.stargazers_count, null);
  assert.equal(before.forks_count, null);
  assert.equal(before.created_at, null);
  assert.equal(before.open_issues_count, null);
  assert.equal(read().created_at, '2026-10-27', 'underlying audit record is preserved');
  recordStarSnapshot(id, 0, 0, 0, 0, 'github');
  const verified = normalize(read());
  assert.equal(verified.stargazers_count, 0, 'a verified true zero remains zero');
  assert.equal(verified.created_at, '2026-10-27');
});
