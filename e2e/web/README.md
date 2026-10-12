# Web E2E smoke tests

The three scenarios in `../scenarios/smoke.ts` run through both Detox (Android/iOS)
and Playwright (web). They cover the seeded dashboard, workplace selection, and
the picker routes into workplace creation and restore. The runners supply launch,
tap, and assertion operations; the user journeys are shared.

The browser uses the existing seed profiles through authenticated query parameters.
These are honored only when both `EXPO_PUBLIC_E2E=1` and the Expo build capability
are enabled. Normal production web builds ignore them.

From the repository root:

```sh
bun run e2e:setup:web
bun run e2e:build:web
bun run e2e:test:web
```

Playwright tooling lives in its own package so mobile installs and the main Bun
lockfile do not require browser test dependencies. Playwright and its dependencies
are pinned in the nested Bun lockfile.
Chromium runs headlessly. Installing OS browser dependencies may require administrator
access; `bunx --cwd e2e/web playwright install chromium` suffices when those libraries
are already installed.

If Bun's default cache is read-only, use a writable cache:

```sh
BUN_INSTALL_CACHE_DIR=/tmp/ffb-bun-cache bun install --cwd e2e/web
PLAYWRIGHT_BROWSERS_PATH=/tmp/ffb-browsers bunx --cwd e2e/web playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/ffb-browsers bun run e2e:test:web
```

The manual **E2E (Web)** GitHub Actions workflow installs the browser, exports the
E2E app, and runs all three scenarios. Failures retain screenshots, videos, and traces
in the uploaded report. Publishing the workflow and running it is a separate step.

A single-page web deployment must serve `index.html` for app routes. The included
local test server does this; a public host needs the equivalent fallback rule.
