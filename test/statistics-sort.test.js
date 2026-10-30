import test from 'node:test';
import assert from 'node:assert/strict';
import { sortLanguageRows } from '../public/pages.js';

const rows = [
  { language: 'Python', repos: 6, totalStars: 10, totalForks: null, avgStars: 2 },
  { language: 'Rust', repos: 2, totalStars: null, totalForks: 8, avgStars: null },
  { language: 'JavaScript', repos: 3, totalStars: 0, totalForks: 0, avgStars: 0 },
];
test('statistics sorting handles every field, preserves zero, and puts unknowns last', () => {
  for (const [key, expected] of [
    ['repos', ['Python', 'JavaScript', 'Rust']],
    ['totalStars', ['Python', 'JavaScript', 'Rust']],
    ['totalForks', ['Rust', 'JavaScript', 'Python']],
    ['avgStars', ['Python', 'JavaScript', 'Rust']],
    ['language', ['Rust', 'Python', 'JavaScript']],
  ]) assert.deepEqual(sortLanguageRows(rows, key).map(row => row.language), expected);
  assert.deepEqual(sortLanguageRows(rows, 'totalStars', 'asc').map(row => row.language), ['JavaScript', 'Python', 'Rust']);
  assert.deepEqual(sortLanguageRows(rows, 'language', 'asc').map(row => row.language), ['JavaScript', 'Python', 'Rust']);
  assert.equal(rows[0].language, 'Python', 'sorting does not mutate fetched data');
  assert.deepEqual(sortLanguageRows(rows, 'invalid'), sortLanguageRows(rows, 'repos'));
  assert.deepEqual(sortLanguageRows([], 'repos'), []);
});
