# Coding Conventions

Standards and patterns for contributing to Full Frills Balance.

---

## File Organization

### Feature modules (`src/features/`)
```
feature-name/
├── components/         # Feature-specific UI components
├── hooks/              # Feature-specific hooks and view models
├── screens/            # Screen components (imported by app/ routes)
├── services/           # Feature-local services (if needed)
├── utils/              # Feature-local utilities
└── index.ts            # Public barrel export
```

### Shared components (`src/components/`)
```
src/components/
├── core/               # Foundational primitives (AppButton, AppCard, AppIcon, AppText, AppInput, ...)
├── charts/             # Chart components (LineChart, BarChart, DonutChart, HeatmapChart, ...)
├── common/             # Shared compound components (InfoSheet, ...)
├── layout/             # Layout wrappers
└── index.ts            # Barrel export
```

### Design system primitives (`src/design-system/`)
```
src/design-system/
├── Box.tsx             # Flexible layout container with token-based spacing
├── Stack.tsx           # Column/Row stacking with gap
├── Text.tsx            # Typography primitive with semantic variants
├── Page.tsx            # Screen-level wrapper with safe area handling
├── Skeleton.tsx        # Loading placeholder with shimmer
├── Separator.tsx       # Visual divider
├── Inset.tsx           # Padding wrapper
├── Inline.tsx          # Horizontal inline layout
├── FadeIn.tsx          # Animated entrance
└── index.ts            # Barrel export
```

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `JournalCard.tsx` |
| Hooks | camelCase with `use` prefix | `useJournals.ts` |
| View Models | camelCase with `use` prefix + `ViewModel` | `useDashboardViewModel.ts` |
| Screen controllers | camelCase with `use` prefix (no `ViewModel` suffix) | `useJournalEditor.ts`, `usePlannedPaymentDetails.ts` |
| View model pairing | Optional `useX` data hook + `useXViewModel` presentation | `usePlannedPaymentDetails` + `usePlannedPaymentDetailsViewModel` |
| Services | PascalCase + `Service` suffix | `BalanceService.ts` |
| Repositories | PascalCase + `Repository` suffix | `AccountRepository.ts` |
| Utilities | camelCase | `formatCurrency.ts` |
| Constants | SCREAMING_SNAKE_CASE | `BALANCE_EPSILON` |
| Types/Interfaces | PascalCase | `AccountType` |
| Design tokens | PascalCase namespace | `Spacing.md`, `Opacity.heavy` |

---

## Component Rules

### Design System Primitives (`src/design-system/`)
- Token-driven: all sizing via `Spacing`, colors via `useTheme()`, opacity via `Opacity`
- No hardcoded pixel values for padding/margin/gap — use spacing tokens
- No hardcoded colors — use theme tokens
- Must work with all themes (Light, Dark, custom themes like GoldObsidian)

### Core Components (`src/components/core/`)
- Wrap design system primitives for app-specific semantics
- No hardcoded opacity values — use `Opacity` tokens (`Opacity.heavy`, `Opacity.medium`, etc.)
- Must include `displayName` if wrapped in `forwardRef`
- Document in `_design-preview.tsx` (dev-only)

### Screen Components (`app/`)
- **Thin routes**: One default export per file, no logic or data access
- Extract all business logic to hooks/view models in `src/features/`
- Use `useTheme()` for consistent theming

---

## State Management

### UIContext — Simple UI state only
```typescript
// ✅ Allowed
hasCompletedOnboarding, themePreference, themeMode, isLoading, isPrivacyMode

// ❌ Not allowed (use hooks/repositories)
accounts, journals, balances, any domain data
```

### Data Hooks — Reactive database access
```typescript
// Pattern: observe + subscribe via WatermelonDB observables
const { journals, isLoading, loadMore } = useJournals()
const { data, isLoading } = useObservable(() => someObservable$)
```

### View Models — Feature-level state composition
```typescript
// Pattern: compose multiple hooks into a single view model
const viewModel = useDashboardViewModel()
// Returns: safeToSpend, netWorth, recentTransactions, etc.
```

---

## Design Tokens

Use semantic tokens from `src/constants/` — never hardcode values:

```typescript
// ✅ Correct
import { Spacing, Opacity, Shape, Typography, Size } from '@/src/constants';

style={{ padding: Spacing.xl, borderRadius: Shape.radius.r3 }}
activeOpacity={Opacity.heavy}

// ❌ Wrong
style={{ padding: 16, borderRadius: 12 }}
activeOpacity={0.7}
```

---

## Logging

Use `logger` from `@/src/utils/logger`, not `console.*`:

```typescript
import { logger } from '@/src/utils/logger';

logger.info('Operation started', { context });
logger.warn('Something unexpected', { error });
logger.error('Operation failed', error);
```

Debug logs are disabled in production. Critical paths should use `TraceService` for performance instrumentation.

---

## Error Handling

1. **Wrap screens** with ErrorBoundary (already done at root)
2. **Repository errors**: Log + throw (let UI handle)
3. **Optional operations**: Log warning, continue gracefully
4. **Critical data errors**: IntegrityService repairs on startup
5. **User-facing errors**: Use `alerts.ts` for formatted dialogs

---

## Testing Philosophy

| Layer | Approach |
|-------|----------|
| Repositories | Jest unit tests with mock database |
| Services | Jest unit tests (especially simulation engine — heavy scenario coverage) |
| Hooks | Jest unit tests for critical hooks (`useDateRangeFilter`, `useObservable`) |
| UI | Visual validation via `/_design-preview` (dev-only) |
| Integration | **Native (authoritative):** Detox specs in `e2e/specs/**` with selectors from `e2e/screens/index.ts` (see `docs/testing/testid-inventory.md`). **Web:** Playwright on the static export in `e2e/`. UI covered by Detox must keep stable `testID`s; rename only with inventory + screen registry updates in the same PR. |
| Money Math | Dedicated tests for currency formatting and money arithmetic |

---

## TypeScript Guidelines

- **Strict mode** enabled (`strict: true` in tsconfig)
- Avoid `as any` — use proper types or `unknown`
- Export interfaces from model files
- Use discriminated unions for status types:
  ```typescript
  type JournalStatus = 'POSTED' | 'VOIDED'
  ```
- `noUnusedParameters` and `noUnusedLocals` are enforced

---

## Code Quality

- **ESLint** with `eslint-config-expo` + `eslint-config-prettier` + `react-compiler` plugin
- **Prettier** for formatting
- **Husky** + **lint-staged** for pre-commit hooks (auto-fix + format on staged files)
- **React Compiler** (beta) enabled for automatic memoization — avoid manual `useMemo`/`useCallback` unless the compiler can't handle the case

---

## Commits

Follow conventional commits:
```
feat: add journal pagination
fix: correct running balance on backdated entry
docs: add architecture documentation
refactor: extract form logic to useJournalForm hook
perf: optimize safe-to-spend pipeline and batch queries
```

---

## Architecture guardrails

Dependency direction (enforced in CI as the remediation plan completes):

```
features / app  →  services & read models  →  repositories / adapters
                         ↓
                    domain types (src/types/domain)
```

**Commands:** Domain modules own state transitions and required side effects (journal generation, rebuild invalidation, audit). Feature hooks build caller input DTOs, invoke one command, and keep screen-local state (validation UI, loading, navigation, analytics presentation).

**Reads:** Reactive read modules and services return domain-owned DTOs. Features adapt them to component props. Services and data modules must not import from `src/features/`, `src/components/`, or feature hooks.

**Repositories:** Persistence adapters with narrow, intent-scoped surfaces. Production feature code must not call repository `create`, `update`, or `delete` for domain entities; use the command API for that entity. Reactive `observe*` / `find` reads from features are allowed until a dedicated read module exists. ESLint enforces this for `src/features/**/hooks/**` (excluding hook tests) via `no-restricted-syntax` on `*Repository.create|update|delete|batchInsert|createJournalWithTransactions`; add documented exceptions in `eslint.config.js` only for true local adapters.

**Safe to Spend:** `SafeToSpendReadModel.forWorkplace(id).watch()`, `watchHeadline()`, and `preWarm()` are the only public entry points. `NotificationService` handles OS notifications and reminders only—not Safe-to-Spend calculation or types.

**Imports:** External file formats are normalized to a single canonical import shape at the plugin boundary before validation and persistence.

**CI ratchets (commits 50–51):**

| Script | Command | Purpose |
| --- | --- | --- |
| Unsafe types | `bun run check:unsafe-types` | Production `src/` + `app/` must not exceed the baseline in `scripts/unsafe-type-baseline.json` (currently **183** allowed hits across `: any`, `as any`, `@ts-ignore` / `@ts-expect-error`, and `as unknown as`; tests excluded; the current scan is **88**). **Policy:** reduce the baseline by **5** per calendar month (any module); update with `node scripts/check-unsafe-type-ratchet.mjs --update` after cleanup. |
| Journal façade | `bun run check:journal-facade` | The deleted `JournalRepository` façade must remain absent. New persistence APIs belong in `src/data/repositories/journal/*` intent modules. |

Run both via `bun run check:architecture`.

**Pull requests:** Before merge, run `bun run check:architecture` locally (or confirm CI green on `check:architecture`). New work must not increase the unsafe-type baseline or reintroduce deleted repository façades.

**Transaction / journal card props:** Two import paths are intentional (commit 48, grill 2026-07-27):

- **Within the journal feature:** `src/features/journal/utils/journalCardAdapter.ts` (and `journalUiUtils` re-exports) for list/editor screens.
- **Cross-feature or service tests:** `src/adapters/transactionCardAdapter.ts` — use this from hub, budget, ledger tests, and any code outside `features/journal` so ESLint dependency rules stay satisfied.

Do not add a third shim; extend the adapter that matches the caller’s layer.

See also `docs/archive/2026-07-entropy/` for the completed 2026-07-27 structural audit (historical). Older recommendations in `docs/codebase-design/AUDIT.md` are historical where marked **Done**.
