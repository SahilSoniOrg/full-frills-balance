---
description: End-to-end component architecture audit for entropy reduction in Expo RN
---

# End-to-End Component Architecture Audit
Audit system structure, state ownership, and boundaries to eliminate data-flow chaos.

## 1. Audit Workflow

### Step 1: Component Inventory & Dependency Mapping
List screens, components, hooks, and contexts. For each:
- **Details**: Responsibility, state owner, subscription list, usage count.
- **Dependencies**: Imports, dependents, circular chains, props passed > 2 layers deep.

### Step 2: Violation Scanning
Identify anti-patterns in existing files:
- **Ownership**: Screens carrying domain calculations, UI components invoking DB writes.
- **Zombie State**: Mirroring query-driven DB states in local `useState`.
- **Abstractions**: Boolean prop explosions (`isX`, `hasY`, `mode`), god hooks.
- **Hidden Coupling**: Order-dependent rendering, implicit parent dependencies.
- **Reactivity & Async**: Stale closures, missing cleanup, race conditions in async actions.

### Step 3: Mandatory Action Protocol
Every finding MUST result in exactly one action:
- `DELETE` | `MERGE` | `SPLIT` | `EXTRACT HOOK` | `INLINE INTO CALLER`

### Step 4: Output Per Finding
Format each issue as follows:
- **A. Files**: Exact paths.
- **B. Problem & Entropy Risk**: Why it creates decay.
- **C. Action**: Exactly one keyword from the protocol.
- **D. Proposed Architecture**: Separation, ownership, and directory placement.
- **E. Before/After Sketch**: Dense side-by-side diff mockups.

## 2. Refactor Strategy
1. **Phase 1: Integrity**: Race conditions, duplicated state, subscription memory leaks.
2. **Phase 2: Structural**: Decouple components, extract hooks, inline god components.
3. **Phase 3: Cleanup**: Dead code elimination, uniform styling token applications.

## 3. Definition of Done (Strict)
- Data flow is strictly unidirectional.
- Every state node has exactly one primary owner.
- A new engineer can trace any screen's data path in under 30 seconds.

