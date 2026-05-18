---
description: Component architecture audit for targeted React Native UI areas
---

# Targeted Component Audit
Audit component structure and boundaries in a specific UI area to reduce design and state entropy.

## 1. Audit Checks
- **Orchestration**: Do screens delegating domain actions avoid carrying calculations?
- **Purity**: Do visual presentation components avoid direct data operations?
- **State Location**: Do hooks/view-models encapsulate derived visual states?
- **Repetitions**: Are there identical UI pieces or hook behaviors to consolidate?
- **Abstractions**: Are base elements cluttered with speculative boolean flags?

## 2. Action Protocol
Select exactly one action for each issue:
- `DELETE` | `MERGE` | `SPLIT` | `EXTRACT HOOK` | `INLINE INTO CALLER`

## 3. Format per Finding
- **Files**: Affected items.
- **Problem**: Decay mechanism.
- **Action**: One protocol keyword.
- **Sketch**: Brief description of the planned structure change.

