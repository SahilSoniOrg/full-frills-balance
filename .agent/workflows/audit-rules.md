---
description: Maintain compact and effective agent context rules
---

# Audit & Prune Agent Rules
Prevent rule bloat and optimize the agent's prompt footprint.

## Steps
1. **Lessons Learned**: Check recent git logs/commits for recurring traps or errors.
2. **Update `quirks.md`**: Append newly discovered caveats under core principle tags.
3. **Prune `constraints.md`**: Remove obsolete constraints or behaviors that are consistently followed.
4. **Verify Negations**: Phrase all items in `constraints.md` as explicit "What NOT to do" negations.
5. **Deduplicate**: Keep architectural boundaries in `constraints.md` and core principles in `principles.md`.
6. **Health Check**:
// turbo
```bash
./scripts/check-rules.sh
```
