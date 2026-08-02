# Simplification playbook

Reuse for each domain lane (accounts done → journal → import / SMS). Prefer remove over relocate. No behavior change.

1. Pick one domain lane and the user actions that overwhelm.
2. Record hop count before (date + SHA) from pinned entry files.
3. Write/update one spine doc with ≤6 layers + related-doc links.
4. Inventory callers (`rg` + find references); collapse parallel seams; delete only if zero production callers, tests retargeted, barrels updated, verify green.
5. Keep existing correctness spines (commands, graphs, `ledgerWriteService`); no god façades.
6. Stop when a stranger can onboard from the spine and hop count dropped.
7. Next domain — do not boil the ocean.

**Delete criteria:** zero production imports of the path; test imports retargeted or deleted; barrels updated; no string-based require of the basename; `bun run verify` green.

**Spine docs:** [ACCOUNTS.md](ACCOUNTS.md) · [JOURNAL.md](JOURNAL.md)
