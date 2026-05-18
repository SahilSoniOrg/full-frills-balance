---
description: Periodic architecture and reliability audit for Expo + WatermelonDB codebase
---

# Codebase Architecture Audit
Deep periodic audit of the entire repository to catch data integrity, reactivity, and performance risks.

## 1. Audit Scope
- **Boundaries**: Decoupling of screens, components, services, repos, and routes.
- **Reactivity**: High-frequency trigger lag, re-render loop risks, missing observer cleanups.
- **Data Invariants**: Unbalanced journal entries, non-base currency math, state mirroring (`useState`).
- **Resilience**: Boot bottlenecks, background/resume behaviors, offline sync race conditions.

## 2. Methodology
1. **Critical Flows**: Trace Onboarding, Accounts, Journal, Reports, and Import/Export.
2. **Data Path**: Trace `query -> transform -> subscribe -> render -> mutate`. Identify stale reads or optimistic failures.
3. **Guardrails**: Flag structural decay, source-of-truth breaches, and duplicate query engines.

## 3. Output Format
1. **Verdict**: Health Score (0-100) + top 2 systemic issues.
2. **Findings (by Severity: Critical/High/Medium/Low)**:
   - **Files**: Clickable paths.
   - **Risk**: Pattern, failure mode, and correctness hazard.
   - **Fix**: Non-obvious trade-off and implementation sketch.
3. **Plan**: Immediate (critical bugs), Near-term (structure), and Deferred (cleanup).

## 4. Auditor Posture
- Direct and specific. No generic advice, filler, or fluff.
- Call out underspecified behaviors and design tradeoffs.

