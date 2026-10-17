# V2 row dictionaries

Twelve immutable dictionary IDs, `<table>/v1`, each use a zstd dictionary capped at 16,384 bytes. The small Workplace metadata table trains a smaller dictionary; exact sizes and hashes are pinned in the artifact lock.
The native zstd 1.5.7 round trip passed on the iOS simulator and Android emulator
before native dictionary integration. These are simulated-target results.

`recipe.json` pins schema 35, seed 1179001394, 4,096 synthetic rows per table and
fastCover parameters. `../shortKeys/schema35.json` pins the field assignments.
The multilingual corpus contains no real financial records or raw SMS data.

Generate with the exact zstd CLI version 1.5.7 matching the vendored library:

```sh
node scripts/sync/generate-corpus.mjs --write --out=/tmp/ffb-v2-synthetic-corpus
ZSTD=/path/to/zstd-1.5.7 node scripts/sync/train-dictionaries.mjs --write
node scripts/sync/embed-dictionaries.mjs --write
```

Run one trainer at a time. No build hook or app import trains dictionaries.
The trainer rebuilds its own seeded samples and accepts no external corpus path.
`artifacts.lock.json` records dictionary, corpus, recipe, map and generator hashes.
Existing IDs cannot be overwritten; changes require a new version. Keep old IDs
in the binary permanently. Ship read capability before enabling new write IDs.

For reproduction, use `train-dictionaries.mjs --check`. For the inexpensive CI
embedding check, use `embed-dictionaries.mjs --check`. It compares the committed
binary hashes and generated C++ exactly, without requiring the trainer or simulator.
