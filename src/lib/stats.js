// src/lib/stats.js
// Stats computation for charts - clones trendshift.io stats page

import { subDays, subMonths, subYears, formatISO, eachMonthOfInterval, eachDayOfInterval, eachWeekOfInterval } from 'date-fns';

export function computeMonthlyStats(repos) {
  // Aggregate by language per month
  const byLanguage = {};
  
  for (const repo of repos) {
    const lang = repo.language || 'Unknown';
    const created = new Date(repo.created_at);
    const monthKey = formatISO(created, { representation: 'date' }).slice(0, 7); // YYYY-MM
    
    if (!byLanguage[lang]) byLanguage[lang] = {};
    if (!byLanguage[lang][monthKey]) byLanguage[lang][monthKey] = { stars: 0, forks: 0, count: 0 };
    
    byLanguage[lang][monthKey].stars += repo.stargazers_count || 0;
    byLanguage[lang][monthKey].forks += repo.forks_count || 0;
    byLanguage[lang][monthKey].count += 1;
  }
  
  return byLanguage;
}

export function computeYearlyStats(repos) {
  const byLanguage = {};
  
  for (const repo of repos) {
    const lang = repo.language || 'Unknown';
    const created = new Date(repo.created_at);
    const yearKey = created.getFullYear().toString();
    
    if (!byLanguage[lang]) byLanguage[lang] = {};
    if (!byLanguage[lang][yearKey]) byLanguage[lang][yearKey] = { stars: 0, forks: 0, count: 0 };
    
    byLanguage[lang][yearKey].stars += repo.stargazers_count || 0;
    byLanguage[lang][yearKey].forks += repo.forks_count || 0;
    byLanguage[lang][yearKey].count += 1;
  }
  
  return byLanguage;
}

export function computeLanguageStats(repos) {
  const stats = {};
  
  for (const repo of repos) {
    const lang = repo.language || 'Unknown';
    if (!stats[lang]) {
      stats[lang] = { repos: 0, totalStars: 0, totalForks: 0, avgStars: 0 };
    }
    stats[lang].repos += 1;
    stats[lang].totalStars += repo.stargazers_count || 0;
    stats[lang].totalForks += repo.forks_count || 0;
  }
  
  for (const lang of Object.keys(stats)) {
    stats[lang].avgStars = Math.round(stats[lang].totalStars / stats[lang].repos);
  }
  
  return stats;
}

export function getTopLanguages(repos, limit = 10) {
  const langStats = computeLanguageStats(repos);
  return Object.entries(langStats)
    .map(([language, data]) => ({ language, ...data }))
    .sort((a, b) => b.repos - a.repos)
    .slice(0, limit);
}

export function formatChartData(byLanguage, metric = 'stars') {
  // Convert to Chart.js format
  const languages = Object.keys(byLanguage);
  const allMonths = new Set();
  
  for (const lang of languages) {
    Object.keys(byLanguage[lang]).forEach(m => allMonths.add(m));
  }
  
  const months = Array.from(allMonths).sort();
  
  return {
    labels: months,
    datasets: languages.map((lang, i) => ({
      label: lang,
      data: months.map(m => byLanguage[lang][m]?.[metric] || 0),
      borderColor: getColor(i),
      backgroundColor: getColor(i, 0.1),
      tension: 0.4,
    })),
  };
}

function getColor(index, alpha = 1) {
  const colors = [
    [37, 99, 235],    // blue
    [16, 185, 129],   // emerald
    [249, 115, 22],   // orange
    [236, 72, 153],   // pink
    [139, 92, 246],   // violet
    [20, 184, 166],   // teal
    [234, 179, 8],    // yellow
    [220, 38, 38],    // red
    [107, 114, 128],  // gray
    [59, 130, 246],   // light blue
  ];
  const [r, g, b] = colors[index % colors.length];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function generateMockTimeSeries(repos) {
  // Generate realistic time series data for demo
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(formatISO(d, { representation: 'date' }).slice(0, 7));
  }
  
  const topLanguages = getTopLanguages(repos, 6).map(l => l.language);
  
  const byLanguage = {};
  for (const lang of topLanguages) {
    byLanguage[lang] = {};
    for (const month of months) {
      // Simulate growth
      const base = 1000 + Math.random() * 5000;
      const growth = Math.random() * 1.5;
      byLanguage[lang][month] = {
        stars: Math.round(base * growth),
        forks: Math.round(base * growth * 0.15),
        count: Math.round(base * 0.01),
      };
    }
  }
  
  return {
    monthlyStars: formatChartData(byLanguage, 'stars'),
    monthlyForks: formatChartData(byLanguage, 'forks'),
    yearlyStars: formatYearlyChartData(repos, 'stars'),
    yearlyForks: formatYearlyChartData(repos, 'forks'),
  };
}

function formatYearlyChartData(repos, metric) {
  const years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'];
  const topLanguages = getTopLanguages(repos, 6).map(l => l.language);
  
  return {
    labels: years,
    datasets: topLanguages.map((lang, i) => ({
      label: lang,
      data: years.map((y, j) => {
        const base = 50000 * Math.pow(1.3, j);
        return Math.round(base * (0.5 + Math.random()));
      }),
      borderColor: getColor(i),
      backgroundColor: getColor(i, 0.1),
    })),
  };
}