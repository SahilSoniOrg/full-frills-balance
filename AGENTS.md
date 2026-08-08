# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single product: **Full Frills Balance**, an offline-first, double-entry
personal finance app built with **Expo SDK 57 / React Native 0.86 / TypeScript 6**.
Package manager is **Bun** (`bun.lock`); Node 22 is pinned via `.nvmrc`. There is **no
backend service** — persistence is embedded (WatermelonDB → SQLite on native, LokiJS/
IndexedDB on web and in Jest). See `README.md` for the full command list; only
non-obvious, cloud-relevant notes live here.

### Running / testing in the cloud VM (Linux, no simulators)

- The cloud VM has no iOS Simulator or Android emulator, so **native flows
  (`expo run:ios` / `expo run:android`, Detox, Maestro) cannot run here.** Use the
  **web target** to run and manually test the app end-to-end.
- Start the app for manual testing with `npx expo start --web --port 8081`. Metro serves
  on port `8081`; the web JS bundle is compiled **lazily on the first browser request**,
  so the first page load takes ~10-30s (subsequent loads are fast). A curl/HTTP 200 does
  not mean the bundle finished — watch the Metro log for a `Web Bundled ... index.js`
  line and `[🍉] [Loki] Database ...` lines, which confirm the app booted.
- The web app is fully interactive: onboarding, creating accounts, and posting journal
  entries all work. Web data is stored in the browser's IndexedDB, so clearing site
  storage resets to the fresh onboarding flow.
- Quick way to get realistic data without manual entry: **Settings → Maintenance & Reset
  → Setup Demo Workspace → Generate → Restart** (seeds an isolated demo workplace).

### Quality gates (no long-running services required)

- Standard commands are in `package.json` / `README.md`: `bun run typecheck`,
  `bun run test` (Jest), `bun run lint` (`expo lint`), and `bun run verify` (the CI gate:
  typecheck + `test:ci` + lint). Jest uses an in-memory LokiJS DB — no external services.

### Gotchas

- **Always install with `--ignore-scripts`** (as CI does:
  `bun install --frozen-lockfile --ignore-scripts`). The `react-native-litert-lm`
  postinstall downloads macOS-only iOS frameworks and is useless (and slow) on Linux.
- Metro logs many `Require cycle: ...` warnings on web bundling — these are benign and
  expected, not errors.
- `bun run lint` currently reports a few pre-existing `react-hooks/exhaustive-deps` /
  `array-type` **warnings** (0 errors); these are not regressions.
- Web E2E (Playwright, `bun run test:e2e`) targets the static web export on port `8081`
  and needs browsers installed first via `bunx playwright install --with-deps`.
