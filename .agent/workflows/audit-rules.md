---
description: Keep agent rules lean; rank pruning and consolidation opportunities
---

# Audit Agent Rules
Shrink `.agent/rules` prompt footprint. Find safe cuts and clearer placement—not a full rewrite.

**Boundaries**: `.agent/rules/*.md` and overlap with `role.md`. Out of scope: app code, Cursor user rules, skills. Report only unless the user asks to apply edits.

## Placement (one idea, one file)
| File | Holds |
|------|--------|
| `principles.md` | Domain invariants and product bar. |
| `role.md` | Agent priorities and pointers (not duplicate MUST NOT lists). |
| `constraints.md` | MUST NOT items only—explicit negations. |
| `quirks.md` | Repo-specific traps, tagged with principle (e.g. `[KISS]`). |

## Steps
1. **Baseline** — Per-file bytes + `./scripts/check-rules.sh` (10KB budget for `.agent/rules` + `AGENTS.md` when present).
2. **Dedupe** — Same rule in two files? Keep the sharper negation in `constraints.md` or the invariant in `principles.md`; drop the duplicate.
3. **Prune** — Obsolete quirks, constraints the codebase already enforces, narrative that repeats `role.md`.
4. **Git signal** — Recent commits: recurring traps → one-line quirk; repeated violations → constraint negation (not both).
5. **Compress** — Long bullets → one line if meaning stays; merge only when tags align.

## Improvement tags (rank biggest win first)
- `prune:` safe delete. Replacement: nothing or `role.md` already covers it.
- `dedupe:` one copy kept elsewhere. Name the survivor file.
- `move:` wrong file (principle vs constraint vs quirk). Name target.
- `shrink:` same rule, fewer words. Show shorter line.

## Output
1. **Verdict**: `LEAN` | `OK` | `BLOATED` (budget + duplication).
2. **Improvements** (ranked): `<tag> <file>: <what>. <replacement or target>. [~bytes]`
3. **Apply list** — Only if user wants edits: minimal diff bullets, no drive-by reformat.
4. **net**: `~<N> bytes possible` (or `Lean already. Keep ./scripts/check-rules.sh in habit.`)

## Health check
// turbo
```bash
./scripts/check-rules.sh
```
