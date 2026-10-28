#!/usr/bin/env node
// scripts/fetch-trending.js
// Fetches trending GitHub repositories using GitHub Search API

import { getTrendingRepos } from '../src/lib/github-api.js';
import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.resolve('.trendshift', 'cache');
const LANGUAGES = [
  'TypeScript', 'Python', 'JavaScript', 'Rust', 'Go', 
  'Shell', 'CSS', 'HTML', 'Java', 'C++', 'C', 'Swift', 'Kotlin'
];

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  
  console.log('Fetching trending repos from GitHub API...');
  const repos = await getTrendingRepos(LANGUAGES);
  
  console.log(`Fetched ${repos.length} unique repos across ${LANGUAGES.length} languages`);
  
  const output = {
    repos,
    metadata: {
      fetched_at: new Date().toISOString(),
      languages: LANGUAGES,
      total: repos.length,
    },
  };
  
  await fs.writeFile(
    path.join(CACHE_DIR, 'trending.json'),
    JSON.stringify(output, null, 2)
  );
  
  console.log(`Saved to ${CACHE_DIR}/trending.json`);
  console.log(`Top repo: ${repos[0]?.full_name} (${repos[0]?.stargazers_count}★)`);
}

main().catch(err => {
  console.error('Fetch failed:', err);
  process.exit(1);
});