---
trigger: model_decision
description: Core product and engineering principles for the application
---

# Product & Engineering Principles

## 1. Domain Invariants
- **Double-Entry**: Ledger-first. Silent numerical errors > crashes.
- **Ledger Canonical**: Balances derived from ledger. All journals must balance (debits == credits).
- **Explicit Types**: Account types stable: Asset, Liability, Equity, Income, Expense.

## 2. Core Doctrines
- **KISS**: Simple, linear, synchronous flows > complex reactive/async streams.
- **DRY**: Math/queries inside specialized engines (`BalanceService`/repos). No duplicated logic.
- **YAGNI**: No speculative tables, columns, or routes. Deliver only active requirements.
- **SOLID/SRP**: UI renders, services compute domain logic, repositories/models handle DB operations.
- **Clean Code**: Zero `any` types, readable naming, comment the *why* of complex logic.

## 3. UX & Scope
- **Scope**: Complete core flows first. Keep complexity bounded. Near one-tap primary actions.
- **Reliability**: Non-negotiable offline-first. Deterministic, testable migrations.
- **Decisions**: Make smallest safe choice preserving correctness. Flag tradeoffs.
