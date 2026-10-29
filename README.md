# Amani

Your independent open-source field guide. Discover projects, save a personal
shortlist, compare real signals and choose your next building block.

- Save up to 24 projects in your browser; compare up to four and share a link.
- Read the original Amani field guide: attention is not a quality rating.
- Explore timestamped Daily, Weekly and Monthly GitHub Trending collections,
  observed growth, repository profiles, language statistics and topics.
- No ads, tracking scripts, paid placements or visitor accounts in this release.

Public website: https://kaluzy.github.io/amani/

## Hosting

GitHub Pages serves a static export of public repository data. The hourly
`Publish Amani` workflow refreshes GitHub Trending, exports JSON, builds actual
HTML entry points for every repository/topic, and deploys through GitHub Actions.
Scheduled runs can be delayed by GitHub. Every collection retains its real source
timestamp: this is a periodically updated website, not a real-time event stream.

Search, filtering, sorting, grid/list layouts, charts, deep links and browser
history run locally in the browser. Saved names stay in browser local storage;
comparison links contain only selected public names. Repository suggestions use public GitHub
Issues because Pages cannot run the Node/SQLite submission endpoint. No private
workspace submissions, tokens, backups or SQLite database are published.

Yearly growth needs verified observations on two distinct UTC dates; missing
history is shown as unavailable, never fabricated. Public observations persist
through a build cache and a published, allowlisted public seed. A cache miss can
recover the latest deployed seed; the checked-in seed is the initial fallback.

## Development

Requires Node 22+, npm and Chromium (Puppeteer installs a browser by default).

```sh
npm ci
node scripts/pages-seed.js import
npm run serve
```

The local Express website is at http://127.0.0.1:3002. Local hosting retains
SQLite-backed suggestions; GitHub Pages switches to the Issues workflow.

```sh
npm run refresh
node scripts/pages-seed.js export
npm run build:pages
npm test
```

`AMANI_DB_PATH` selects a disposable/public SQLite store. The Pages output is
`dist/`; `PAGES_BASE=/amani` is the GitHub project base path. The workflow publishes
only that output. Do not publish a local database or workspace backups.

`PAGES_ORIGIN` can configure an approved HTTPS origin and `PAGES_BASE` may be empty
for a future root-domain deployment. No custom domain or hosting migration is
configured by this release. Run `npm run verify:dist` to validate every generated
route, exported JSON endpoint, data reference, metadata tag and asset before upload.
The builder generates a matching public recovery seed automatically.

## Public use versus monetization

The free site is not an ad-network approval or a business-launch clearance. Review
hosting restrictions, provenance/reuse rights, original-content requirements,
privacy disclosures and owner-approved monetization before selling traffic or
placements. No revenue is promised. See [the shipping review](SHIPPING-REVIEW.md)
and [source notices](NOTICE.md).

## Architecture and verification

The shared shell and components live in `public/`. `deployment.js` handles
project-relative routing and exported JSON without changing local API behavior.
The static builder and allowlisted seed import/export are in `scripts/`.
The Node API and data-integrity modules remain available for local development.

Tests use disposable databases and actual Chromium. Coverage includes data
integrity, source failures, XSS escaping, routes, chart instances, forms, responsive
card alignment and the static Pages website without a backend. See
`ARCHITECTURE.md` for the local data contracts.

GitHub Pages setup follows [GitHub's custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
