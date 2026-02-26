---
description: How to audit and prune agent rules for maximum performance
---

# Workflow: Audit & Prune Agent Rules

Use this workflow to prevent rule bloat and maintain a sharp, effective agent context.

1. **Review Recent Failures**: Check recent git commits (especially reverts or "fix" commits) for "lessons learned".
2. **Update `quirks.md`**: Add any discovered pitfalls or repo-specific quirks to `quirks.md`. Use the format:
   - **Quirk Name**: Concise description of the trap and the fix.
3. **Analyze `constraints.md`**: Look for rules that are no longer violated or that agents consistently follow without explicit instruction. Prune them.
4. **Run Health Check**:
// turbo
```bash
./scripts/check-rules.sh
```
5. **Verify Negations**: Ensure that every rule in `constraints.md` is phrased as a "What NOT to do" (Negation) where possible.
6. **Remove Redundancy**: If a rule exists in both `principles.md` and `constraints.md`, move the strict boundary to `constraints.md` and keep only the value in `principles.md`.
