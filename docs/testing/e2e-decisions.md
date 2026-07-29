# E2E testing decisions

**Last updated:** 2026-07-29

## Scope

| Layer | Runner | Location | CI |
| ----- | ------ | -------- | --- |
| Native iOS | Detox + Jest | `e2e/specs/**/*.e2e.ts` | `detox.yml` on every PR |
| Native Android | Detox + Jest | `e2e/specs/**/*.e2e.ts` | local only (not in CI yet) |
| Web export | Playwright | `e2e/**/*.test.ts` | `playwright.yml` nightly + manual |
| Unit / integration | Jest | `src/**` | `ci.yml` on every PR |

Native Detox is the **authoritative** UI signal for SQLite, widgets, and on-device RN behavior. Playwright covers overlapping journeys on the static web export (LokiJS adapter).

## Platforms

- **iOS simulator first** — `iPhone 17`, configuration **`ios.sim.release`** in `.detoxrc.js` (embedded JS bundle, no dev client / Metro)
- **iOS debug (optional)** — `ios.sim.debug` for local dev-client debugging only
- **Android emulator (local)** — configuration `android.emu.debug`; AVD name via `DETOX_AVD_NAME` (default `Pixel_7_API_34`). Not in CI until flake budget and emulator infra are defined.

## Selectors

- Primary: `testID` on tappable controls, tabs, and form fields
- Naming: `{feature}-{role}` or existing IDs in `e2e/screens/index.ts`
- Specs must not call `element(by.*)` directly — use `e2e/actions/**`

## E2E harness (seed / reset)

Detox passes launch arguments (honored in **debug and release simulator** builds):

| Arg | Value | Meaning |
| --- | ----- | ------- |
| `e2eAuth` | `ffb-e2e-v1` | Required auth token |
| `e2eReset` | `1` | Clear MMKV + reset WatermelonDB |
| `e2eSeedProfile` | `onboarded` \| `journal-ready` \| `planned-payments` | Programmatic onboarding + fixtures |

Implementation: `src/testing/e2eBootstrap.ts`, invoked from `UIProvider` during preference load.

Set `EXPO_PUBLIC_E2E=1` for E2E builds (see `.env.e2e.example`).

## Scripts

```bash
bun run e2e:build:ios      # Release simulator build (embedded bundle, EXPO_PUBLIC_E2E=1)
bun run e2e:test:ios       # All critical specs under e2e/specs (no Metro)
bun run e2e:build:android  # Gradle debug + androidTest APKs for Detox
bun run e2e:test:android   # Same specs on Android emulator (local)
bun run test:e2e         # Playwright (web)
bun run verify           # typecheck + unit Jest + lint (Linux)
```

## CI policy

- **No arbitrary `sleep`** in specs — use Detox `waitFor`
- **0 retries** in CI until flake budget is understood
- Flaky tests: `it.skip` + ticket, not silent retries
- Detox failures upload `artifacts/detox/`

## Owners

Mobile E2E: engineering (PR review required for `e2e/specs` and `src/testing/e2e*`).

## PR checklist (Detox / testIDs)

Reviewers: when the PR touches UI used by native E2E or adds/changes selectors:

- [ ] New or changed controls have a stable `testID` (kebab-case, `{feature}-{role}` where possible).
- [ ] IDs used in tests are registered in `e2e/screens/index.ts` and listed in `docs/testing/testid-inventory.md`.
- [ ] Specs and flows use `e2e/actions/**` helpers, not inline `element(by.*)` (except rare, documented exceptions).
- [ ] Renamed/removed testIDs update inventory, screen constants, and any Playwright `getByTestId` callers in the same PR.
- [ ] No new arbitrary `sleep` in `e2e/specs`; use `waitFor` / action-layer waits.

## Deferred (guide phases 4–6)

- WireMock / `*.ui.ts` — N/A (offline-first)
- Android Detox in CI
- Testmo, MCP debug server
