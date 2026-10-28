# Amani

An open-source repository discovery site with readable, aligned cards; Daily,
Weekly and Monthly GitHub Trending collections; recorded growth; repository
profiles; language statistics; and topic browsing.

Public website: https://kaluzy.github.io/amani/

## Hosting

GitHub Pages serves a static export of public repository data. The hourly
`Publish Amani` workflow refreshes GitHub Trending, exports JSON, builds actual
HTML entry points for every repository/topic, and deploys through GitHub Actions.
Scheduled runs can be delayed by GitHub. Every collection retains its real source
timestamp: this is a periodically updated website, not a real-time event stream.

Search, filtering, sorting, grid/list layouts, charts, deep links and browser
history run locally in the browser. Repository suggestions use public GitHub
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

`TRENDSHIFT_DB_PATH` selects a disposable/public SQLite store. The Pages output is
`dist/`; `PAGES_BASE=/amani` is the GitHub project base path. The workflow publishes
only that output. Do not publish a local database or workspace backups.

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
