// src/lib/momentum.js
// Momentum ranking algorithm - clones trendshift.io approach

import { subDays, subWeeks, subMonths, subYears, formatISO } from 'date-fns';

const LANGUAGE_WEIGHTS = {
  TypeScript: 1.1,
  Python: 1.05,
  JavaScript: 1.0,
  Rust: 1.15,
  Go: 1.1,
  Shell: 0.9,
  CSS: 0.8,
  HTML: 0.8,
  Java: 0.95,
  C: 1.0,
  'C++': 1.0,
  Swift: 1.05,
  Kotlin: 1.0,
};

export function computeMomentumScore(repo, period = 'daily') {
  const { stargazers_count, forks_count, language } = repo;
  
  // Get stars for the period (would need historical data)
  // For now, use a heuristic based on total stars and recency
  const stars = repo[`stars_${period}`] || Math.max(1, stargazers_count * 0.001);
  const forks = forks_count || 0;
  const langWeight = LANGUAGE_WEIGHTS[language] || 1.0;
  
  // trendshift's formula: momentum = stars * weight + forks * 0.5
  // with boost for recently trending
  const baseScore = (stars * langWeight) + (forks * 0.5);
  
  // Recency boost: repos that appeared recently get a boost
  const createdDaysAgo = (Date.now() - new Date(repo.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const recencyBoost = createdDaysAgo < 30 ? 1.5 : createdDaysAgo < 90 ? 1.2 : 1.0;
  
  return Math.round(baseScore * recencyBoost * 100) / 100;
}

export function rankRepositories(repos, period = 'daily') {
  const scored = repos.map(repo => ({
    ...repo,
    momentum_score: computeMomentumScore(repo, period),
    rank: 0,
    period,
  }));

  scored.sort((a, b) => b.momentum_score - a.momentum_score);
  
  scored.forEach((repo, i) => {
    repo.rank = i + 1;
    repo.rank_change = 0; // Would need previous rank
  });

  return scored;
}

export function getPeriodStats(repos, period) {
  const ranked = rankRepositories(repos, period);
  
  return {
    period,
    total: ranked.length,
    top: ranked.slice(0, 25),
    languages: getLanguageDistribution(ranked),
    generated_at: new Date().toISOString(),
  };
}

function getLanguageDistribution(repos) {
  const counts = {};
  for (const repo of repos) {
    const lang = repo.language || 'Unknown';
    counts[lang] = (counts[lang] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);
}