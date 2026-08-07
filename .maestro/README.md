# Maestro E2E (local)

Native E2E tests with [Maestro](https://maestro.dev/). Flows live in `.maestro/`. The `maestro/` directory at the repo root is only for **dev-client recording** scripts.

## Flows

| Flow | What it covers |
|------|----------------|
| `dashboard-smoke.yml` | Programmatic seed (`onboarded` profile) → dashboard |
| `onboarding.yml` | Full onboarding UI (no seed) |

Seeded flows pass the same launch arguments as Detox (`e2eAuth`, `e2eReset`, `e2eSeedProfile`) via Maestro `launchApp.arguments`. See `subflows/launch-seeded.yml`.

## Run locally

One command for the full stack (Jest SMS integration + Maestro + Detox smoke on Android/iOS):

```bash
bun run e2e:local
```

Prerequisites: Android emulator and/or iOS simulator running; release builds present (`bun run e2e:build:android` / `e2e:build:ios`).

Individual steps:

```bash
npx expo prebuild --platform android   # after native / plugin changes
bun run e2e:build:android              # or e2e:build:ios
bun run e2e:maestro                    # Maestro flows on installed APK
bun run e2e:test:android             # Detox specs
bun run e2e:test:ios
```

## vs Detox

| | Maestro | Detox |
|--|---------|-------|
| Android | ✅ local | ✅ local |
| iOS | ✅ local | ✅ local + GitHub Actions CI |
| Deep JS integration | limited | richer launch-arg harness |

Both share the same E2E seed harness in `src/testing/`.
