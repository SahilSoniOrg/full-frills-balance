# Environment and reproducibility

| Field | Value |
|---|---|
| Repository | `/Users/sahilsoni/me/projects/full-frills-balance` |
| Commit | `6fb79796782c473f664a2a90ac0ca827c79a9908` |
| Branch | `main` |
| Working tree at audit start | clean; branch was 2 commits ahead of `origin/main` |
| Audit date | 2026-08-25 |
| Host timezone | Asia/Kolkata |
| Package manager/lockfile | Bun / `bun.lock` |
| Expo | `~57.0.8` |
| React Native | `0.86.0` |
| React | `19.2.3` |
| Engine | Hermes expected from Expo/RN defaults; runtime confirmation pending |
| Architecture | New Architecture expected; runtime confirmation pending |
| React Compiler | enabled in `package.json`, `app.config.ts`, and Babel |
| Database | WatermelonDB `^0.28.1-0`, native SQLite JSI; LokiJS used by web/tests per audit profile |
| Lists | FlashList `2.0.2`, FlatList/SectionList/ScrollView also present |
| Reactive layer | RxJS `^7.8.2`, managed replay caches |
| Native/platform scope | Android/iOS native projects, custom SMS module, widgets, notifications, LiteRT, crypto, filesystem/zip |
| Runtime measurement | No physical-device run established at audit start |
| Synthetic-data policy | Required; no private financial/SMS/model data in artifacts |

## Baseline commands

Commands are recorded in `run-log.csv`. Passing tests/type checks are correctness/tooling evidence only, not performance evidence.

## Known limitations at start

- Physical-device Android/iOS evidence is not yet available.
- Release-like runtime measurement and native profiler traces require an available simulator/device/build path; until run, runtime impact claims are prohibited.
- Dataset calibration must be grounded in repository fixtures/schema, not round-number assumptions.

