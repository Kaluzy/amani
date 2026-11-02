# Amani: five-person usability check

Status: prepared, not conducted. Automated Chromium tests are not five real users.
Ask five consenting developers/builders who have not used Amani. Do not coach them
through the task. Use participant numbers, not names, emails or screen recordings
by default. Do not enter private project information in public links or Issues.

## Session (about 15 minutes)

1. Ask: “What is this website for?” Record their explanation before giving context.
2. Pick a goal: a self-hosted toolkit, a first SaaS, or local AI. Find a suitable
   decision guide, explain one limitation and open the supporting documentation.
3. Find and save two catalog projects. Compare them. Identify a recorded fact,
   an editorial opinion and a value that is unknown. Explain why stars are not quality.
4. Share a comparison. Explain what another visitor sees and whether that saves
   the projects to their browser. On a phone, repeat the navigation without help.
5. Save a workbench check-in, find the weekly RSS link, and explain what happens
   when returning later. Ask whether they expect email or background alerts.
6. Find source freshness. Ask what Reload does and what an old collection means.

## Capture without inventing outcomes

For participants P1–P5 record task completion (independent / assisted / not done),
approximate time, first wrong turn, confusing wording and one verbatim suggestion
with permission. Leave results blank until actual sessions happen. Analytics stays
off until the owner configures it later; this plan does not require a tracker.

Proposed acceptance: at least four of five independently find a relevant guide,
save/compare, and correctly explain freshness and the absence of automatic alerts.
Fix repeated misunderstandings before adding accounts or paid features. This is a
small qualitative study, not a statistically representative conversion benchmark.

## Release and operations checks

- `npm test`: isolated unit/API/browser regressions, failures, unknowns and persistence.
- `npm run verify:dist`: all exported routes/assets/data, private-file exclusion and
  fresh source observations. It deliberately rejects artifacts older than three hours.
- `npm run qa:public`: actual published route/data/RSS availability and release ID.
- `npm run qa:browser`: desktop/mobile navigation, rendering, links and comparisons.
- `npm run qa:performance`: cold Chromium at 390/1440px with 4× CPU slowdown;
  180 KB decoded home JavaScript / 1.2 MB unique decoded assets and resource-transfer
  budgets, no home chart load. Fresh contexts allow normal in-page cache reuse.
  Loading CLS must remain at or below 0.1 in this lab; the loading region reserves
  viewport height so a visible footer does not jump when data arrives.
  Reports lab LCP/CLS; not physical-device testing or field Core Web Vitals.

Current schedule diagnosis: on November 2, inspected scheduled Actions runs all
succeeded but started multiple hours apart. Moving the hourly minute away from :23
is a best-effort adjustment, not a scheduler guarantee. Source GETs now use bounded
transient retries; malformed/empty responses still fail, preserving the published
release. Source-health checks reject missing, invalid, future and >3h-old batches.
The public Data status page exposes actual collection age and links to workflow runs.
The owner can manually run the existing publishing workflow when scheduling lags.
Guaranteed freshness would require an approved hosting/scheduler decision; no new
provider, recurring cost or account was added. Do not hide the stale-data warning.
