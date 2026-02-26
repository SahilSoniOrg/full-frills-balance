---
trigger: model_decision
description: Core product and engineering principles for the application
---

# Product & Engineering Principles

## Product intent
- This is a balance-first, double-entry personal finance app.
- Mental clarity and trust are more important than feature count.
- Silent numerical mistakes are higher severity than crashes.

## Accounting invariants
- Balances are derived from ledger data, not manually cached totals.
- Every journal must balance (debits == credits) before persistence.
- Account types are explicit and stable: Asset, Liability, Equity, Income, Expense.
- Editing historical data must preserve auditability.

## UX doctrine
- Daily flows should be fast and low-friction.
- Common actions (like adding expenses) should remain near one-tap.
- Reports can trade latency for accuracy.
- Opinionated constraints are preferred over confusing flexibility.

## Scope discipline
- Prefer finishing core accounting flows over adding adjacent features.
- Avoid speculative abstractions and optionality without active use cases.
- Keep complexity bounded so a new contributor can understand architecture quickly.

## Reliability promises
- Offline-first behavior is non-negotiable.
- Corruption handling should favor safe recovery and explicit user signaling.
- Imports/exports must remain backward-compatible when practical.
- Data migrations should be deterministic and testable.

## Engineering doctrine
- Single source of truth for domain state (WatermelonDB).
- Clear ownership boundaries (UI, feature orchestration, domain services, repositories).
- Simple, boring, proven patterns over clever patterns.
- Tests and validation must enforce critical invariants.

## Decision protocol for uncertain cases
- Make the smallest safe decision that preserves correctness.
- Document assumptions in code comments or follow-up notes when needed.
- Flag unresolved tradeoffs explicitly instead of hiding them in implementation.
