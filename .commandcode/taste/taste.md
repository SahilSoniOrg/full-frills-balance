# Tooling
- Use bun instead of npm or yarn for package management and running scripts. Confidence: 0.70

# TypeScript
- Avoid `any` type; prefer `unknown` with narrowing or explicit domain types instead. Confidence: 0.75
- Use strict TypeScript with no escape hatches; type assertions and casts should be justified and minimal. Confidence: 0.70

# Code Style
- Use magic numbers, hardcoded strings, and UI labels from `src/constants/` (app-config.ts, design-tokens.ts) instead of inline literals. Confidence: 0.80
- Use semantic design tokens from design-tokens.ts for colors, spacing, and typography instead of inline values. Confidence: 0.75
- Keep component APIs small and intention-revealing; avoid boolean prop explosions and over-configured base components. Confidence: 0.65

# Architecture
- WatermelonDB is the single source of truth for domain state; avoid duplicating DB state into long-lived React state. Confidence: 0.70
- Use feature-first organization in `src/features/*` with feature index files as public API boundaries. Confidence: 0.65
- Keep screens as thin orchestrators; move domain logic to hooks/view-models and persistence to repositories. Confidence: 0.65
- Respect existing architectural patterns (repository pattern, design system primitives, service abstraction layers) as deliberate design choices following software design principles; avoid suggesting their removal solely to reduce file/line counts. Confidence: 0.70

# UI Design
- For the Accounts screen: use the original AccountCard layout with the account name in body/base text and the balance (xxxl/32px) centered prominently below it. Avoid compact/inline layouts. Confidence: 0.75
- Avoid decorative left accent bars, colored rails, or shape indicators on transaction cards; keep the card layout clean without positional decorations. Confidence: 0.75

# Architecture
- When moving files, update import paths in all consumers directly rather than keeping barrel re-export files at old locations as migration bridges; use `bunx tsc` to find/fix stale imports. Confidence: 0.65
