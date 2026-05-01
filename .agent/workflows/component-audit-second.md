---
description: End-to-end component architecture audit for entropy reduction in Expo React Native codebases
---

Use this workflow to perform a full-system audit of component structure, state ownership, and UI logic boundaries.

## Goal
Reduce long-term entropy by enforcing clear ownership, eliminating duplication, and preventing bug-prone patterns.

---

## Execution Rules
- Cover the ENTIRE codebase (no sampling)
- Do not stop mid-way
- Do not skip steps
- Do not give generic advice — all findings must be tied to actual files
- Every issue MUST result in a concrete action

---

## Workflow

### 1. Build Full Inventory

List ALL:
- Screens
- Components
- Hooks
- Context/Providers

For each item:
- Name
- File path
- Type (Screen / Component / Hook / Provider)
- Responsibilities (actual behavior)
- State ownership
- Side effects (fetching, mutations, subscriptions)
- Usage count (where used)

---

### 2. Dependency & Data Flow Mapping

For each item:
- What it imports
- What imports it

Identify:
- upward data flow (invalid)
- circular dependencies
- implicit coupling between components
- props passed across 3+ layers

---

### 3. Detect Violations

#### Ownership violations
- Screens implementing business logic
- Components fetching or mutating data
- Hooks mixing UI decisions with domain logic
- Same state duplicated across layers

#### Abstraction issues
- Components with excessive props (especially boolean flags)
- Over-generalized “base” components with weak cohesion
- Components used only once but designed for reuse

#### Duplication
- Repeated JSX structures
- Repeated interaction logic
- Similar hooks with minor differences

#### Hidden coupling
- Order-dependent rendering
- Props that must be used together but are not enforced
- Components relying on parent behavior implicitly

#### Async / React risks
- Stale closures
- Missing effect cleanup
- Race conditions in async logic
- Redundant or repeated fetching
- Uncontrolled subscriptions

---

### 4. Assign Action (MANDATORY)

Each issue must be assigned exactly one:

- DELETE
- MERGE
- SPLIT
- EXTRACT HOOK
- INLINE INTO CALLER

No multiple actions. No ambiguity.

---

### 5. Output Per Finding

For every issue:

A. Files involved  
B. Exact problem  
C. Why it increases entropy or bug risk  
D. Action (one of five)  
E. Proposed structure (name + location + ownership)  
F. Minimal before/after code sketch  

---

### 6. Define Target Architecture

Enforce strict layering:

- Screens → orchestration only
- Hooks (view-models) → state, side effects, derived data
- Components → pure UI

Define:
- ownership boundaries
- data flow direction
- responsibilities per layer

---

### 7. Refactor Plan

Break into phases:

#### Phase 1 — Critical fixes
- race conditions
- duplicated state
- async bugs

#### Phase 2 — Structural fixes
- split/merge components
- extract hooks
- remove bad abstractions

#### Phase 3 — Cleanup
- naming
- folder structure
- dead code removal

Each phase must:
- be independently executable
- avoid breaking behavior
- include migration notes

---

### 8. Predict Failure Cases

List top 5 most likely future bugs caused by current structure.

For each:
- trigger scenario
- root cause in code structure
- how proposed changes prevent it

---

## Constraints

- Prefer composition over configuration
- Avoid speculative abstractions
- Do not preserve components “for future reuse”
- Co-locate logic with ownership
- Optimize for clarity over cleverness

---

## Anti-Patterns to Eliminate

- God components
- Hooks that fetch + transform + control UI
- Boolean prop explosions (isX, hasY, variant, mode combinations)
- Components that both control and display state
- Hidden shared state via context without clear contracts

---

## Definition of Done

- Data flow is unidirectional and obvious
- Each piece of state has a single owner
- No duplicated logic affecting correctness
- A new developer can trace any screen’s data flow in under 30 seconds

