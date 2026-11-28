---
trigger: model_decision
description: Core product and engineering principles for the application
---

# Product & Engineering Principles

Domain invariants and product bar. MUST NOTs in `constraints.md`; agent priorities in `role.md`.

## Domain Invariants
- **Double-Entry**: Ledger-first. Silent numerical errors > crashes.
- **Ledger Canonical**: Balances derived from ledger only (see `constraints.md` for journal balance rules).
- **Explicit Types**: Account types stable: Asset, Liability, Equity, Income, Expense.

## UX & Reliability
- **Offline-first**: Deterministic migrations; smallest safe change that preserves correctness.
- **Scope**: Core flows first; bounded complexity; near one-tap primary actions.
