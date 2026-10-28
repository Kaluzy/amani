// scripts/github-events.js
// Consumes GitHub Events API for real-time star events

import { recordGithubEvent, getRepoId, recordStarSnapshot, upsertRepo } from '../src/lib/database.js';
import fetch from 'node-fetch';

const GITHUB_EVENTS_URL = 'https://api.github.com/events';
const POLL_INTERVAL = 60000; // 1 minute

let lastEventId = null;
let isRunning = false;

async function fetchEvents() {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Amani-Trending/1.0',
  };
  
  if (lastEventId) {
    headers['If-None-Match'] = lastEventId;
  }
  
  const res = await fetch(GITHUB_EVENTS_URL, { headers });
  
  if (res.status === 304) {
    return []; // No new events
  }
  
  if (!res.ok) {
    throw new Error(`GitHub Events API: ${res.status}`);
  }
  
  const events = await res.json();
  
  // Update lastEventId from ETag or first event
  const etag = res.headers.get('ETag');
  if (etag) lastEventId = etag;
  else if (events.length > 0) lastEventId = events[0].id;
  
  return events;
}

function filterStarEvents(events) {
  return events.filter(e => 
    e.type === 'WatchEvent' && e.payload?.action === 'started'
  );
}

async function processStarEvent(event) {
  const repoName = event.repo?.name;
  if (!repoName) return;
  
  try {
    // Ensure repo exists in DB
    let repoId = getRepoId(repoName);
    
    if (!repoId) {
      // Fetch repo details
      const res = await fetch(`https://api.github.com/repos/${repoName}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Amani-Trending/1.0',
        }
      });
      
      if (res.ok) {
        const repo = await res.json();
        repoId = upsertRepo(repo);
      }
    }
    
    if (repoId) {
      // Record the event
      recordGithubEvent(event);
      
      // Update star count snapshot
      // We need to fetch current stars - for now record the event
      console.log(`⭐ Star event: ${repoName} by @${event.actor?.login}`);
    }
  } catch (e) {
    console.error(`Error processing star event for ${repoName}:`, e.message);
  }
}

async function pollLoop() {
  while (isRunning) {
    try {
      const events = await fetchEvents();
      const starEvents = filterStarEvents(events);
      
      if (starEvents.length > 0) {
        console.log(`[${new Date().toISOString()}] Processing ${starEvents.length} star events`);
        for (const event of starEvents) {
          await processStarEvent(event);
        }
      }
    } catch (e) {
      console.error('Poll error:', e.message);
    }
    
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

async function main() {
  isRunning = true;
  console.log('Starting GitHub Events consumer...');
  console.log(`Polling every ${POLL_INTERVAL / 1000}s`);
  
  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    isRunning = false;
  });
  
  await pollLoop();
}

main().catch(e => {
  console.error('Events consumer failed:', e);
  process.exit(1);
});