# Web E2E smoke tests

Runs the shared scenarios in `../scenarios/smoke.ts` in Chromium via Playwright.
Seed profiles come from authenticated URL params, honored only in `EXPO_PUBLIC_E2E=1` builds.

```sh
bun run e2e:setup:web && bun run e2e:build:web && bun run e2e:test:web
```
