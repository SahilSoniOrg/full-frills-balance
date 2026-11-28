---
name: find-ui-clones
description: >-
  Hunt for structural UI clones of a component or pattern before calling a
  shared extract done. Use after extracting/creating a shared component, when
  asked "is this the only place?", or to find reinvented headers, rows, badges,
  toggles, or section chrome across the codebase.
---

# Find UI Clones

After extracting or proposing a shared UI piece, search the rest of the repo for
reinventions of the **same job**, not just the same name. Report before migrating.

## 1. Fingerprint the pattern

Write a short structural fingerprint of the target (what must be true to match):

- **Job** — e.g. collapsible list section chrome
- **Parts** — title + count pill + optional amount + far-right chevron
- **Signals** — styles/names to grep (`countBadge`, `isCollapsed`, `ChevronDown` + section header)
- **Non-goals** — what looks similar but is a different role (day stamps, form overlines, modal badges)

## 2. Search by structure, not filename

Run several greps in parallel on `src/`:

1. Distinctive style keys / class names from the fingerprint
2. Composition signals (collapse state + chevron + count/amount)
3. Known cousins already in the design system (`DisclosureToggle`, `SectionLabel`, `ListRow`, …)
4. Allowlists / guard tests that name hand-built variants (`noHandBuiltChevronRows`, etc.)

Read the closest hits. Do not stop at the first two call sites.

## 3. Classify every hit

Put each hit in exactly one bucket:

| Bucket | Meaning | Next step |
|--------|---------|-----------|
| **Same invention** | Same job + same parts (density/dot extras OK) | Migrate onto the shared component |
| **Cousin** | Same job shape, different look/role | Leave alone; name why |
| **Not the same** | Shared word only (badge, chevron, count) | Ignore |

Extend the shared API only for **Same invention** needs (`leading`, `actions`, `showChevron`, …). Do not absorb cousins via speculative boolean flags.

## 4. Output format

```markdown
### Fingerprint
- Job: …
- Parts: …
- Non-goals: …

### Same invention (migrate)
- `path` — what matches; optional API gap

### Cousins (leave)
- `path` — why different

### Not the same
- brief list or "none"

### Proposed migrations
1. … (ask before applying unless user already said to migrate)
```

## 5. Migrate only when asked (or already approved)

Default: report first. When migrating:

1. Swap clones onto the shared component
2. Delete now-dead local styles
3. Update guard-test allowlists if the hand-built row moved into the shared file
4. Run tests for the shared component + each migrated call site

## Anti-patterns

- Declaring “only place” after checking the feature folder alone
- Forcing `JournalDayHeader`-style cousins into a list-section primitive
- Growing the shared component with mode flags for one-off cousins
- Renaming without consolidating
