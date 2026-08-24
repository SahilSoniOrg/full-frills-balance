# Mobile E2E contract

Authoritative mobile E2E is **Detox** against `e2e/specs/**/*.e2e.ts`.

CI and local commands:

- `bun run e2e:ci` / `bun run e2e:test:ios` — iOS simulator, release + embedded bundle
- `bun run e2e:test:android` — Android emulator, same layout

Typecheck that tree with `bun run typecheck:e2e` (`tsconfig.e2e.json`). App `tsc` excludes these specs so a Detox import cannot fail product typecheck.

Playwright runs in scheduled or manually dispatched CI, not as a pull-request gate. The web export is useful coverage, but its 60-minute browser job would duplicate the faster Detox PR gate and add unrelated web-runner flake to mobile changes. Run it locally when changing web behavior.

Not the mobile contract:

- Playwright `e2e/*.test.ts` — web export only (`bun run test:e2e`)
- Maestro `.maestro/` — local device smoke, not CI gate

Layout: `e2e/specs` (cases), `e2e/screens` (testIDs), `e2e/actions` (launch/flows), `e2e/constants`, `e2e/utils`. Native setup lives in `detox/README.md`.
