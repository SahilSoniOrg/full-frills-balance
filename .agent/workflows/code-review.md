---
description: Production code review for staged changes
---

# Changeset Code Review
Audit staged changes (`git diff --cached`) for regressions and architectural drift before commit.

## 1. Mandatory Scope & Checks
- **No Scope Creep**: Audit only staged files and directly coupled neighbors.
- **Ledger Invariant**: All accounting balances/journals must balance.
- **WatermelonDB**: No state duplication in `useState`, proper observable lifecycles.
- **Boundaries**: Thin route wiring, feature encapsulation, repository data accesses.
- **Clean Constants**: No inline magic numbers, values, or colors (use `@/src/constants/`).

## 2. Rule Cross-Check
Match staged changes against `.agent/rules/constraints.md` and relevant `.agent/rules/quirks.md` sections (not a full rules repeat).

## 3. Output Format
1. **Verdict**: `SAFE` | `RISKY` | `BLOCKED`
2. **Blocking Issues**: Must resolve before merge.
3. **Observations**: Non-blocking improvements & suggestions.

For each issue, specify: `File | Pattern | Correctness Risk | Concrete Fix`.