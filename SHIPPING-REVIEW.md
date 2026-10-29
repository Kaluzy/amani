# Amani release review — 2026-10-29

## Release scope

An independent, free open-source field guide with public-source observations,
original evaluation guidance and a browser-only personal comparison workbench.
The existing cream/green design and amber/plum metric accents are retained.

Five unused prototype/mock modules were retired; they remain recoverable in Git
history. No historical commits were erased, and required license notices remain.

Original product features: save up to 24 public projects on this browser, compare
up to four, share a comparison without silently saving another visitor’s choices,
and use an evidence-first evaluation guide. Storage failure has an explicit
temporary fallback. No ads, trackers, paid accounts or newsletter capture added.

## Revenue launch gates (not completed by this release)

1. Review hosting suitability before turning this into an online business.
   [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
   restrict its use as free hosting for an online business, commercial transactions
   or commercial SaaS. This release leaves hosting unchanged; migration, a domain
   purchase and any costs need the owner’s approval.
2. Verify provenance/reuse rights. Renaming a prototype or removing unused code
   does not erase Git history, confer copyright ownership, or establish trademark
   clearance. Required third-party license notices remain. See NOTICE.md.
3. Build a body of genuinely useful original content and a returning audience.
   The workbench and field guide add value but do not guarantee ad approval or
   earnings. [AdSense readiness guidance](https://support.google.com/adsense/answer/7299563)
   requires original useful content, not simply scraped or republished listings.
4. Choose an approved monetization model, publisher/advertiser accounts, operator
   contact details and appropriate commercial disclosures. AdSense must review a
   site before serving ads. No fabricated publisher IDs or empty ads.txt supplied.
5. Before advertising or analytics, review privacy/consent requirements for the
   actual regions and providers. The current privacy page covers the actual
   browser-only shortlist, public comparison links and GitHub-hosted suggestions.

## Engineering release gates

- Full regression suite with actual Chromium; explicit error/retry and storage
  failure cases; real charts; direct links; search/filter/sort/pagination; keyboard
  navigation; responsive grid/list and aligned card sections.
- Every generated HTML route and JSON endpoint validated before upload, including
  repository/topic data references, ranked memberships, source counts, sitemap,
  metadata, assets, privacy exclusions and matching recovery data.
- Public seed schema rejects invalid counts, paths, topics, dates and membership.
- Dependency audit and legacy-branding/mock-code scan; static CSP; preserved
  third-party notices. No guarantee of absence of all security vulnerabilities.
- Static public site audited after deployment; source CI must pass before release.

Detailed measured results are recorded in the private shared coordination note.
Nothing in this document is an ad-network approval, legal opinion or revenue
forecast. Treat the free public release and a monetized-business launch separately.
