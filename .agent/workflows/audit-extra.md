---
description: Comprehensive systems architecture and local-first reliability audit
---

# Ruthless Systems Architecture Audit (Local-First RN)
Catch silent corruption, timing races, performance decay, and architectural leaks under high load (10k+ records).

## 1. Hard-Stop: Domain Inventory & Relationship Map
Before starting, build a complete domain inventory. List and group by domain:
- **Entities**: Screens, Components, Hooks, Providers, Models, Services.
- **Relationships**: e.g., `Hook X -> Model Y`, `Provider Z -> Mutation A`.
- Flag missing pieces explicitly.

## 2. Phase 0: System Mapping
- **Control Points**: Identify components imported across 5+ domains, or exposing dual read/write logic.
- **Mutation Gateway Trace**: Trace `UI action -> handler -> mutation layer -> persistence -> subscription -> UI`. Mark as UNVERIFIED if untraceable.

## 3. Phase 1: Data Integrity & Reactivity
- **Gateways**: Flag components bypassing gateways or calling direct DB writes.
- **Zombie State**: Locate DB data duplicated in local `useState`/`useReducer`.
- **Timing & Optimistic Risks**: Check rollback mechanisms for failed optimistic updates.
- **Idempotency & Stale Reads**: Flag non-idempotent operations (retries) and read-after-write caching lags.

## 4. Phase 2: Performance & RN Bridge
- **Bridge Congestion**: Large single-batch serialization or N+1 query bridge crossings.
- **Re-render Bloat**: Uncleaned hooks, scaling arrays, and full-list re-renders from single-item updates.

## 5. Phase 3: Risk & Failure Traces
Format every **Critical/High** finding with:
- **Execution Trace**: Chronological sequence (T1, T2, T3).
- **State Audit**: Memory vs. Database state snapshot at each step.
- **Detection Gap**: Why this escapes unit tests or dev logs.

## 6. Phase 4: Remediation Plan
- **Invariants**: Propose strict guardrails (e.g., "all mutations flow through `LedgerGateway`").
- **Implementation**: Write concrete lint rule concepts, test assertions, or runtime validations.

## 7. Output Format
1. **Verdict**: Score (0-100) + top 2 "System Killers."
2. **System Map**: Domains, gateways, and control points.
3. **Risk Ledger**: `Severity | File Link | Issue | Failure Mode | Concrete Fix`.
4. **Refactor Timeline**: Immediate, Near-Term, and Deferred.
5. **Rules**: 3-5 non-negotiable guidelines for future agents.

## 8. Final Invariant Check
"If a silent corruption bug exists: which entity is most at risk, which write path causes it, and why would standard logging fail to reveal it?"
