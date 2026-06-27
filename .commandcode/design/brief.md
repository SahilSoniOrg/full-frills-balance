# Design Brief: Full Frills Balance

## Register

**Product** — instrument-grade UI for daily financial operators. This app is opened multiple times per day to check balances, log transactions, and review spending. Consistency and speed earn trust more than novelty.

## Users & Context

**Primary user**: Someone managing personal finances day to day. They check "how much can I spend right now?" before making decisions. They log transactions (income, expense, transfers). They review their accounts, commitments, and budgets.

**State**: Often in motion — between meetings, checking a balance before a purchase, reviewing SMS auto-imports. The interface must be glanceable, one-handable, and fast.

**Pressure**: Financial anxiety. The core proof object (Safe to Spend) exists to answer "am I okay?" before the user can articulate the question.

## Product Purpose

Show users what money is actually available after pending charges, bills, committed amounts, and upcoming obligations are removed. The full frills — multiple themes, typography schemes, charts, reports, SMS import, budgeting — serve this core purpose without distracting from it.

## Voice

Calm, confident, specific. Not playful, not corporate, not urgent.

- Sentence case everywhere
- One verb per button — never OK or Confirm
- Errors describe what happened and what to do next, not what went wrong
- Loading copy names the actual work: "Posting entry", "Verifying books", not "Loading…"
- Empty states teach the space and offer the next action
- No exclamation points
- Theme descriptions communicate mood, not technical specs: "Mint on obsidian, calm authority" not "Dark blue, high contrast"

## Anti-References

- Not a gamified finance app (no badges, streaks, rewards)
- Not a budgeting-first app (YNAB, Mint style)
- Not a transaction-feed-only app (bank app style)
- Not a dark-terminal dev tool
- Not a pastel/millennial-pink neo-bank

## Design Principles

### Opinionated over flexible
Strong defaults, no variant explosion. Components with ~5 props max. If a prop lacks a current product use case, it does not exist.

### Semantic over literal
No raw hex colors, no ad-hoc rgba. All colors from semantic tokens (surface, textSecondary, asset, expense). Same for spacing, typography, radius, elevation.

### Visual consistency > developer convenience
It should be harder to do the wrong thing than the right thing. The design system API is frozen — no new variants or props without a concrete use case.

## Accessibility Expectations

- Touch targets: minimum 44pt, 48pt comfortable
- Full dark mode with dedicated palettes per theme (not inversion)
- Privacy mode toggles all sensitive values to "••••"
- WCAG contrast engine via `onContrast()` — picks light/dark foreground for any background
- `useReducedMotion` hook for system accessibility preference — skeleton pulse and entrance animations skip when active
- Tabular numbers enabled by default for all text — digits are stable widths, amounts don't jitter
- Color-blind safe indicators: left accent bar on TransactionCards (shape+color coding, not hue-only)
- Dark mode weight compensation: body/caption text bumped one weight step (regular→medium, medium→semibold) in dark mode to counter optical thinning of light-on-dark
- High contrast minimums: primary/body text ≥10:1, secondary ≥4.5:1, tertiary ≥3:1 on dark backgrounds (≤4.5:1 on light backgrounds where tertiary must be less prominent than secondary)
- Disabled buttons: `surfaceSecondary` background + `textTertiary` text — muted but legible (not same-color-on-same-color)
- Icon buttons: `accessibilityRole="button"` + `accessibilityState` set on TouchableOpacity
- AppToggle: `accessibilityRole="switch"` + `accessibilityState={{ checked, disabled }}`
- ColoredDot: `importantForAccessibility="no"` (decorative companion to text labels)
- `accessibilityLabel` required on all icon-only controls (verified: 60+ label instances across codebase)

## Visual Foundation

### Color strategy — Whisper commitment level
One role color (per theme) doing the work, applied sparingly. 4 themes, each with distinct hue intent:
- **Deep Space** (default): mint #7DD3A8 on near-black #0A0A0C — calm, high contrast, neutral-meets-nature. Works for general financial operators.
- **Ivy**: purple #5C3DF5 on white #FAFAFC — clean, minimal, original Ivy Wallet heritage.
- **Editorial**: slate blue #4A6FA5 on off-white #F8F9FA — professional, warm, editorial tone.
- **Gold Obsidian**: gold #D4AF37 on obsidian #0A0C10 — warm, luxurious, high-stakes.

### Semantic color roles
primary, success, warning, error, asset, liability, equity, income, expense, transfer — mapped to palette per theme. Used exclusively through `useTheme()` — no direct palette access.

### textTertiary contrast — fixed in recolor pass
Dark modes achieve ≥4.5:1 through dedicated per-theme values (not palette references). Light modes accept 2.5-2.7:1 as an inherent tradeoff: tertiary text must be less prominent than secondary, and on light backgrounds that means lower contrast.

### Typography — 3 font schemes
- **Serif & Sans** (Deep Space default): Instrument Sans (UI, body) + DM Serif Display (headings, amounts)
- **Modern Geometric** (Ivy): Raleway (all weights) — one-family system, clean
- **Classic Serif** (Editorial): Inter (UI, body) + Crimson Text (headings)

Type scale: xs(12px) → sm(14px) → base(16px) → lg(18px) → xl(20px) → xxl(24px) → xxxl(32px) → jumbo(48px) → hero(72px)

Line heights per content length:
- Micro-copy (<30 chars): 1.2 (tight) — badges, dates, metadata
- Short-form (30-80 chars): 1.5 — body text, descriptions, transaction titles
- Long-form (300+ chars): 1.7 — explanatory content, modals

### Spacing — 4px grid
none(0) → xs(4) → sm(8) → md(12) → lg(16) → xl(20) → xxl(24) → xxxl(32) → xxxxl(40)

### Depth — 3 planes
Background (z: 0, canvas/content) → Content (z: default/elevation sm/md/lg) → Attention (z: 500+, overlays/modals/toasts)

### Radius
xs(4) → sm(8) → md(12) → lg(16) → xl(24) → r4(16) → r3(20) → r2(24) → r1(32) → full(9999)

### Responsive breakpoint
SafeToSpendCard switches to side-by-side layout at ≥600px (tablet/landscape). Cards use flex layout otherwise.

## Component Rules

- AppCard: variant (default/secondary/outline/ghost), paddingSize, radius, elevation. No nested cards.
- AppButton: variant (primary/secondary/outline/ghost/destructive), size (sm/md/lg), loading. Pill shape. Disabled: surfaceSecondary bg + textTertiary text.
- AppText: variant (caption/body/subheading/heading/title/xl/hero), color, weight, tabular (default true).
- AppToggle: `accessibilityRole="switch"` with `accessibilityState`. TouchableOpacity.
- Badge: variant, size (sm/md), solid. Pill shape, always colored by semantic role.
- IconButton: variant (primary/surface/clear/error/success), 40px circle. Must have accessibilityLabel and accessibilityRole="button". Disabled: surfaceSecondary bg.
- ColoredDot: 8px color circle. `importantForAccessibility="no"`. Used as legend indicator alongside text labels.
- Box: polymorphic layout atom (View/Pressable/TouchableOpacity). Full prop-based style system. Theme-aware.
- Stack/Inline/Inset: layout primitives for vertical/horizontal/padding composition. No custom spacing outside the 4px grid.

## Composition Lanes

**Monitor** (Dashboard): Safe to Spend hero → breakdown bar (responsive: side-by-side with chart on tablet) → planned payments → recent transactions. Priority flows top to bottom, most actionable data first.

**Operate** (Journal Entry): Two modes — Simple (guided tabs: Income/Expense/Transfer) and Advanced (multi-line debit/credit). Vertical form flow: description → metadata → account selection → amount → submit.

**Explore** (Accounts): SectionList with hierarchy-indented cards. Each card shows icon + name (bold body) in header row, centered 32px balance below, optional monthly income/expense stats with vertical divider.

**Configure** (Settings): Sections grouped by dependency (Personalization → Data → Maintenance → Danger Zone). Each section is a list page → detail screen.

**Explore** (Activity, Reports): Search + filter + scrollable result lists with day separators and grouped metadata.

## Work That Stays Outside This Brief

The following are handled by mode tools and don't need permanent documentation here: specific color hex values per theme, exact type scale math, spacing tokens, elevation values, animation curves and durations, component prop tables.
