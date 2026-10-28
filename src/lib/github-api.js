// src/lib/github-api.js
// GitHub API client for fetching trending data

import fetch from 'node-fetch';

const GITHUB_API = 'https://api.github.com';
const HEADERS = {
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Trendshift-Superpowers/2.0',
};

export async function searchRepositories(query, perPage = 100) {
  const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
  return res.json();
}

export async function getRepository(owner, repo) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
  return res.json();
}

export async function getTrendingRepos(languages = [], since = 'daily') {
  const queries = languages.length > 0
    ? languages.map(lang => `stars:>100 language:${lang}`)
    : ['stars:>100'];

  const allRepos = new Map();
  
  for (const query of queries) {
    try {
      const data = await searchRepositories(query, 50);
      for (const item of data.items || []) {
        if (!allRepos.has(item.full_name)) {
          allRepos.set(item.full_name, {
            ...item,
            stars_today: 0, // Will be computed
            stars_week: 0,
            stars_month: 0,
            stars_year: 0,
            fetched_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error(`Error fetching ${query}:`, e.message);
    }
  }

  return Array.from(allRepos.values());
}

export async function getRepoStarsHistory(owner, repo) {
  // Use GitHub's stats API for contributors (includes weekly commits)
  // For stars history, we'd need a separate tracking service
  // For now, return mock data structure
  return {
    daily: 0,
    weekly: 0,
    monthly: 0,
    yearly: 0,
  };
}