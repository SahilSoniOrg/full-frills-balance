# Implementation status and release gates

This page summarizes implemented scope and release work still open. Detailed verification evidence and repeatable commands live in the [native device plan](./native-device-verification-plan.md), [restore interruption plan](./restore-interruption-verification-plan.md), and [native host runbook](./native-host-verification-runbook.md).

## Implemented

- Device → User → Workplace key hierarchy, native key vaults, recovery credentials, and native credential-file pickers.
- Shared C++ row encoding, gzip compression, encryption, signed manifests, and WebAssembly support.
- Complete offline backup export and verified restore on mobile and web.
- Financial validation and atomic restore publication with a manifest-hash receipt.
- Device-local restore completion handoff that resumes key installation, settings, balances, and setup after interruption.
- Local row index and signed commit construction. These are foundations only; there is no online sync loop.

The backup includes the documented financial source tables and audit history. Derived balances, rate caches, and device-specific state are excluded. The web worker and IndexedDB vault do not protect against compromised same-origin scripts.

## Release gates still open

- Verify native vault behavior, app lock, real credential and backup pickers, and interrupted restore on physical iOS and Android devices.
- Complete cross-device backup → wipe → restore verification on physical devices.
- Verify the browser file workflow end to end in supported browsers.
- Measure large-Workplace performance. The full ZIP/row pipeline is not streaming and capture holds the database writer lock during encryption.

Host, simulator, emulator, and browser evidence is recorded in the linked verification documents. Those results do not close the physical-device gates.

## Not implemented

There is no online account enrollment, backend, upload, pull/apply loop, server checkpoint exchange, conflict review, sharing, or key rotation. Local sync tables and commit builders do not provide those features. Supabase Auth is the planned identity direction; no backend project, schema, or integration exists. See [considered approaches](./decisions.md) for decisions that defer these flows.

## Operational follow-up

Earlier Android builds uploaded JavaScript source maps to Sentry because the upload-disable value was incorrect. E2E Release builds now set both required flags to `true`. The affected Sentry artifacts remain pending deletion: bundle IDs `9a64ad56-a282-5ec3-8023-d9c69ee99281` and `9cee3dbf-a88e-5349-aa5b-aceee7d2ca0e`, release `in.sahilsoni.fullfrillsbalance@1.0.0+1`, distribution 1. Recovery phrases and financial fixtures were not included. No external deletion or backend provisioning occurred; see the [native host runbook](./native-host-verification-runbook.md) for build evidence.
