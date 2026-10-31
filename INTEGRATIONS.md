# Amani public tools and integrations

## Owner analytics: prepared, not connected by default

The application includes a consent-gated GA4 adapter. Repository statistics are
not visitor statistics. No measurement ID is checked in and no visitor totals are
invented. To activate, an owner must supply their public `G-…` web-stream ID as the
GitHub repository Actions variable `AMANI_GA4_ID`, then deploy. Never publish an API
secret, service-account file, account password or Measurement Protocol secret.

Before activation, **disable Enhanced Measurement in that GA4 web stream**. Amani
sends manual virtual page views and named tool actions; automatic history/outbound
measurement could duplicate events or capture query parameters. Review the actual
property settings and privacy disclosure before enabling. Confirm in GA4 DebugView
or Realtime using a consenting test visitor; source tests do not prove account-side
delivery. Ad blockers, privacy signals and declined consent reduce coverage.

Basic consent: the Google tag is not requested until an explicit Allow choice.
Decline does not restrict functionality. Footer settings allow withdrawal; an
already-loaded document reloads after opt-out and app-prefixed cookies are expired.
Do Not Track and Global Privacy Control keep collection off. Storage failure is
handled in memory for the current tab. No ads, remarketing, raw search terms,
filter values or saved/comparison lists are deliberately sent by Amani. Referring
sites are reduced to their origin/domain, not full referring URLs. Own events:
`page_view`, `save_repository`, `compare_projects`, `outbound_click`, `filter_used`,
`rss_open`, `search_used`. Page locations exclude query strings and fragments.
Analytics cookies are host-only, scoped to the project path, prefixed `amani`,
with a configured 30-day expiry. This is not a legal/compliance certification.

Official references:
- https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications
- https://developers.google.com/tag-platform/security/guides/consent
- https://developers.google.com/analytics/devguides/collection/ga4/reference/config

## Social discovery: working search links, not fabricated rankings

`/community` builds encoded Reddit/X search links. Repository profiles link to
that tool. No third-party social script, automatic scrape or credential is needed.
Searches happen only when visitors open an external platform; account/sign-in
requirements and results are controlled by the destination. Search terms appear
in shareable page URLs. The page explicitly labels social ranking feeds unconnected.

Genuine rankings need a separate server-side collector, approved credentials,
spending cap, collection timestamps, documented query/window, deduplication,
deleted-content handling and a published scoring method. Do not infer Reddit/X
popularity from GitHub stars or expose tokens in Pages JSON/browser JavaScript.

As checked 2026-10-30: Reddit requires explicit API approval and written approval
for commercial data use. X API uses prepaid pay-per-use credits. No access request,
subscription, credit purchase or paid job was made in this implementation.
- https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy
- https://docs.x.com/x-api/getting-started/pricing

## Useful public features shipped without new paid services

`/discover`: real catalog search with language/license/minimum-star filters,
archived exclusion, saved-only mode, stars/forks/updated sorting, shareable URL,
and bounded incremental rendering. Missing metadata is not fabricated.

`/feeds/daily.xml`, `/feeds/weekly.xml`, `/feeds/monthly.xml`: RSS generated from
the same recorded public collections as each release. Source timestamps are in
item descriptions. `lastBuildDate` means feed build time, not source freshness.
These feed exports are on GitHub Pages, not a new local Node API route.

Next highest-value experiments: measure finder→save→compare usage after analytics
is connected; add genuinely sourced social rankings after access/budget approval;
add opt-in digest/alerts only after email infrastructure, unsubscribe and privacy
decisions. These are hypotheses to test, not guaranteed traffic or revenue.

## Design references and provenance

Supplied logo: `Downloads/Elegant AMANI antique-gold monogram logo.png` copied
unchanged to `public/brand-logo.png`. Its original pixels and transparent background
are preserved. No invented replacement logo is used in current branding.

Reference research, checked 2026-10-30: Bootstrap ~175k stars/78.5k forks;
shadcn/ui ~127k/12.6k; Tailwind CSS ~98k/7.7k; Magic UI ~23k/1.2k. Stars and forks
are different signals, not a design-quality guarantee. The selected direction uses
shadcn's restrained dashboard hierarchy and native glass/neutral/gold styling;
it does not import a second CSS framework, copy paid templates, or claim 100k forks.
- https://github.com/twbs/bootstrap
- https://github.com/shadcn-ui/ui
- https://ui.shadcn.com/blocks
- https://github.com/tailwindlabs/tailwindcss
- https://github.com/magicuidesign/magicui
