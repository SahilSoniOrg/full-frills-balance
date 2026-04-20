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
| Services | PascalCase + `Service` suffix | `BalanceService.ts` |
| Repositories | PascalCase + `Repository` suffix | `JournalRepository.ts` |
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
| Integration | E2E flows in `e2e/` via Playwright (web export) |
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
