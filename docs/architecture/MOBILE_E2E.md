# Mobile E2E contract

Authoritative mobile E2E is **Detox** against `e2e/specs/**/*.e2e.ts`.

CI and local commands:

- `bun run e2e:ci` / `bun run e2e:test:ios` — iOS simulator, release + embedded bundle
- `bun run e2e:test:android` — Android emulator, same layout

Typecheck that tree with `bun run typecheck:e2e` (`tsconfig.e2e.json`). App `tsc` excludes these specs so a Detox import cannot fail product typecheck.

The privacy acknowledgement uses an in-tree overlay in Detox builds. On iOS, Detox stalled with the native React Native `Modal` present during first-run acknowledgement; deferring navigation until `onDismiss` did not unblock the run. Non-E2E builds keep the native modal, and a component test checks this selection. Detox covers the acknowledgement content and continuation flow, but does not verify the native presentation or dismissal path.

Layout: `e2e/specs` (cases), `e2e/screens` (testIDs), `e2e/actions` (launch/flows), `e2e/pages` (page objects), `e2e/constants`, `e2e/utils`. Native setup lives in `detox/README.md`.
