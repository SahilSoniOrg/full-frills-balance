# Codebase Architecture & Standards

**(Law of the Land)**

This document defines **hard constraints** for the codebase.
These are not suggestions, patterns, or preferences.
Violations are considered architectural defects and must be corrected immediately.

---

## 1. Core Philosophy

### 1.1 Feature-First Architecture

The codebase is organized by **domain (what the app does)**, not by technology (components, hooks, screens).

Each feature owns:

* its UI
* its hooks
* its domain logic

If code cannot be clearly assigned to a single feature, it does not belong in a feature.

---

### 1.2 Thin Routing

The `app/` directory is a **routing layer only**.

* No business logic
* No data access
* No calculations
* No state beyond navigation configuration

Routes exist only to connect URLs/navigation state to feature screens.

---

### 1.3 Data-Driven UI

The database is the **source of truth**.

* UI reacts to data
* UI does not derive or persist domain state
* Writes happen in one place only (repositories)

---

## 2. Dependency Direction (Non-Negotiable)

Dependencies may only flow **downward**:

```
app/
  → src/features/
    → src/services/
      → src/data/
        → src/utils/
```

### Forbidden dependency directions

* `src/data` importing from `src/services`, `src/features`, or `src/components`
* `src/services` importing from `src/features` or `src/components`
* `src/components` importing from `src/features`
* Any layer importing from `app/`

**UI depends on data. Data never depends on UI.**

---

## 3. Directory Structure (Strict)

Do not create new top-level directories.

```
/
├── app/                      # ROUTING LAYER (Thin wrappers only)
│   ├── (tabs)/
│   ├── _layout.tsx
│   └── *.tsx                 # Import Screen from src/features/*
│
├── src/                      # APPLICATION CORE
│   ├── features/             # DOMAIN BOUNDARIES
│   │   ├── accounts/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── index.ts      # Public API for the feature
│   │   ├── journal/
│   │   ├── dashboard/
│   │   └── ...
│   │
│   ├── components/           # SHARED UI (No domain logic)
│   │   ├── core/             # Primitives (AppText, AppButton)
│   │   ├── layout/           # Structural (Screen, ScreenHeader)
│   │   └── common/           # Cross-feature composition
│   │
│   ├── data/                 # DATA LAYER
│   │   ├── database/         # WatermelonDB setup
│   │   ├── models/           # DB models
│   │   └── repositories/     # The ONLY place allowed to write to DB
│   │
│   ├── services/             # CROSS-FEATURE BUSINESS RULES
│   │   └── *.ts              # Pure TypeScript, no React, no DB writes
│   │
│   ├── hooks/                # GLOBAL HOOKS (theme, navigation, app-wide state)
│   ├── contexts/             # GLOBAL STATE (UI prefs, session state)
│   └── utils/                # PURE HELPERS (no side effects)
```

---

## 4. Feature Boundary Rules

Each feature is a **closed box**.

### Allowed imports inside a feature

* `src/components/**`
* `src/services/**`
* `src/data/**` (via hooks or repositories only)
* `src/utils/**`

### Forbidden imports

* Internal files from another feature
* Components, hooks, or screens from sibling features

If multiple features need the same code:

* UI → move to `src/components/common`
* Logic → move to `src/services`

---

## 5. Public API for Features

Each feature **must** define a public interface:

```
src/features/<feature>/index.ts
```

### Rules

* Only files exported from `index.ts` may be imported outside the feature
* All other files are private implementation details
* Direct deep imports into another feature are forbidden

This enforces encapsulation mechanically, not socially.

---

## 6. “Where Does This Go?” Decision Tree

Follow this order exactly.

### 6.1 Is it a Screen?

* YES → `src/features/<feature>/screens/<Name>Screen.tsx`
* Ensure a thin route exists in `app/`

### 6.2 Is it a UI Component?

* Generic primitive → `src/components/core`
* Structural layout → `src/components/layout`
* Used by multiple features → `src/components/common`
* Used by one feature only → `src/features/<feature>/components`

### 6.3 Is it Logic or State?

* UI-only state → local state or `contexts/`
* Domain data → `src/data/models` + `repositories`
* Cross-feature business rules → `src/services`
* Pure helper function → `src/utils`

---

## 7. Data Access Rules

### Reads

* Performed via **reactive hooks** (`useAccounts`, `useJournal`)
* Hooks observe the database and expose derived state

### Writes

* Performed **only** in repositories
* UI and hooks must never write directly to the database
* All writes must be explicitly awaited

---

## 8. Hook Constraints

Hooks are **composition tools**, not logic containers.

Rules:

* Hooks may READ data
* Hooks may compose state for rendering
* Hooks may call services
* Hooks may NOT write to repositories
* Hooks may NOT implement business rules

If a hook exceeds ~50 lines, it likely belongs in `services/`.

---

## 9. Coding Standards

### Components

* Functional components only
* Use `React.memo` when props are simple
* Never use raw `Text`; always use `AppText`
* Use design tokens (`@/constants`) only
* Props interface must be exported as `<ComponentName>Props`

### Naming

* Components: `PascalCase.tsx`
* Hooks / utils: `camelCase.ts`
* Folders: `kebab-case`

### Imports

* Absolute imports only (`@/src/...`)
* No relative parent imports (`../../`)

---

## 10. Strict Prohibitions

🔴 DO NOT write logic in `app/`
🔴 DO NOT access the database from UI components
🔴 DO NOT couple sibling features
🔴 DO NOT export domain-specific components from `src/components`
🔴 DO NOT call services directly from UI components (use hooks)
🔴 DO NOT use ad-hoc IDs (`Math.random`, `Date.now`) for persistence

Violations require refactoring, not justification.

---

## 11. Common Failure Modes (Immediate Refactor Signals)

If any of the following appear, the architecture is being violated:

* `app/` files exceeding ~20 lines
* Feature components imported into multiple features
* Hooks performing non-UI calculations
* Services importing React or React Native
* “Temporary” logic placed in `components/common` or `app/`

These are not exceptions. They are defects.

---

## 12. Verification Checklist

Before marking work complete:

* [ ] `app/` contains routing only
* [ ] Imports respect dependency direction
* [ ] Code lives in the correct feature or shared layer
* [ ] No direct DB access outside repositories
* [ ] `AppText` used instead of `Text`
* [ ] Feature boundaries respected

---

**This document exists to prevent entropy.
If something feels hard to place, stop and fix the structure before adding code.**
