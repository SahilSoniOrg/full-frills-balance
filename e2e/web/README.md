# Web E2E smoke tests

Runs the shared scenarios in `../scenarios/smoke.ts` in Chromium via Playwright.
Seed profiles come from authenticated URL params, honored only in `EXPO_PUBLIC_E2E=1` builds.
The encrypted-backup scenario also verifies recovery in a separate browser context,
rejection of a Workplace credential in place of User recovery, all six seeded journals,
and persistence across reload. It uses the real WASM engine and browser file downloads/uploads.
Additional scenarios cover truncated ZIPs, signed-manifest tampering, a genuine recovery
file from another User, clearing failed selections and retrying, User/Workplace setup
interrupted by reload, repeated restore without duplicate journals, and refusal to
overwrite an existing local Workplace. Journal counts exclude inactive screens retained
by React Navigation (`aria-hidden` ancestors).

The restore interruption suite pauses the real recovery/publication/session/cleanup/launch
owners, closes the page and WASM worker, and reopens the same browser context before
retrying through the normal UI. It compares public identity and Device-key metadata,
manifest receipts, complete primary financial rows, audit history and running balances.
Session-write and pending-removal error cases also verify that failed attempts do not
report completion. D/E retry without a User recovery file using saved Device access.
The observer/fault adapter requires the E2E build capability, authenticated bootstrap
and `e2eRestoreVerification=1`; it never reads private keys or copies vaults. It is
excluded from production exports, checked with `bun run check:production-e2e-web-bundle`.
These Chromium tests do not close the native process-kill or real-file-picker gates.

The two-device approval proof uses separate browser contexts and the real app workers:
B generates its own Device key, A wraps the existing User bundle to B's public key,
and B opens it, reloads, restores without a recovery file and exports a backup under
the same User identity. Wrong-vault and substituted-recipient checks must fail.
`support/deviceApproval.ts` is a test-only driver; it installs public metadata and
the already-verified encrypted bundle after native opening succeeds. It does not
implement production pairing UI, fresh authentication, signed Device registration,
expiry/replay protection or an enrollment transport. No Device vault is copied.

```sh
bun run e2e:setup:web && bun run e2e:build:web && bun run e2e:test:web
```

Record successful runs at a watchable pace:

```sh
PLAYWRIGHT_RECORD_VIDEO=1 bun run e2e:test:web
```

Videos, screenshots and disposable recovery files are saved under `test-results/`.
The fresh-browser recovery video is in its scenario's `fresh-browser-video/` subfolder.
Recovery files are test secrets: keep them local and out of version control.
