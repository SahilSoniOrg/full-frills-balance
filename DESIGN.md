# Design System — Full Frills Balance

## Product Context

- **What this is:** Offline-first double-entry personal finance for people who want correct accounting semantics on-device, without a cloud account.
- **Who it's for:** Builders of their own financial truth — net worth, Safe to Spend, budgets, journals, reports.
- **Space/industry:** Personal finance / ledger apps (peers: Ivy Wallet, Monarch, Copilot, YNAB).
- **Project type:** React Native (Expo) mobile app with web export; data-dense dashboard and journal flows.

## Source of Truth in Code

| Concern | Location |
|--------|----------|
| Tokens, themes, typography | `src/constants/design-tokens.ts` |
| Theme hook | `src/hooks/use-theme.tsx` |
| Defaults | `src/contexts/UIContext.tsx` (`themeId`, `fontId`) |
| Living preview (dev only) | `app/_design-preview.tsx` → `DesignPreviewScreen` |
| User-facing theme copy | `src/constants/copy/ui-strings.ts` |

**Rule:** The design preview screen must consume tokens exactly like production. No hardcoded colors there. If it looks wrong in preview, it is wrong everywhere.

## Aesthetic Direction (Shipped)

- **Direction:** **Precision fintech instrument** — calm, opinionated, accounting-literate. Default palette is **Deep Space** (mint accent on obsidian), not Ivy purple.
- **Decoration level:** Minimal — cards, soft elevation, rounded corners (Ivy-derived radius scale). No marketing gradients or decorative blobs.
- **Mood:** Authority without hype. Safe to Spend is the emotional center; charts and density live in Reports, not noise on home.
- **Strategy (2026-07):** Ship and refine the four existing themes. **Ledger & Lamplight stays documented only** until a concrete UI pass justifies a fifth theme in code.

## Home Screen (Dashboard)

**Decision (2026-07-26):** Safe to Spend header, breakdown bar, and **30-day projection chart stay visible** on the dashboard. No collapse control. Deeper report charts remain under Reports; the home projection is the forward-looking companion to the headline number.

| Always on home |
|----------------|
| Safe to Spend hero amount |
| Breakdown bar (available / reserved / outstanding) |
| Projection line chart |

## Typography

### Default font scheme (`FontIds.DEEP_SPACE`)

| Role | Family |
|------|--------|
| Body / UI | Instrument Sans (Regular → Bold) |
| Display / headings | DM Serif Display |
| Subheadings | Instrument Sans Bold |

### Alternate font schemes (user-selectable)

| FontId | Body | Headings |
|--------|------|----------|
| `ivy` | Raleway | Raleway Bold |
| `editorial` | Inter | Crimson Text |

### Scale (from `Typography.sizes`)

| Token | px | Typical use |
|-------|-----|-------------|
| xs | 12 | Captions |
| sm | 14 | Labels |
| base | 16 | Body |
| lg–xxl | 18–24 | Headers |
| jumbo | 48 | Large amounts |
| hero | 72 | Safe to Spend / headline money |

**Loading:** Bundled via Expo font loading (see app font setup). Do not add ad-hoc web fonts in screens.

## Color

### Approach

**Balanced + semantic:** Every theme maps the same semantic keys (`asset`, `liability`, `income`, `expense`, `transfer`, `success`, `error`, etc.). No raw hex in UI code.

### Default theme: Deep Space (`ThemeIds.DEEP_SPACE`)

| Role | Light | Dark |
|------|-------|------|
| Background | `#F5F5FA` | `#0A0A0C` |
| Surface | `#FFFFFF` | `#14141A` |
| Primary (mint) | `#7DD3A8` | `#7DD3A8` |
| Text | `#1A1A1E` | `#F0ECE4` |
| Text secondary | `#6E6E73` | `#8A8694` |

Semantic accents (dark palette reference): expense `#EB5757`, asset `#5D9CEC`, liability/warning `#F2994A`, transfer `#BB6BD9`.

### User-selectable themes

| ThemeId | Character | Primary accent |
|---------|-----------|----------------|
| `deep-space` | Mint on obsidian — **default** | `#7DD3A8` |
| `gold-obsidian` | Gold on warm obsidian | `#D4AF37` |
| `ivy` | Purple on clean gray/white | `#5C3DF5` |
| `editorial` | Slate blue, warm off-white | `#4A6FA5` |

Full hex definitions live in `DeepSpacePalette`, `GoldObsidianPalette`, `IvyPalette`, `EditorialPalette` inside `design-tokens.ts`.

### Dark mode

Per-theme light/dark pairs in `ThemeSchemes`. Prefer adjusting saturation/contrast in palette definitions rather than per-screen conditionals.

## Spacing

- **Base unit:** 4px grid (`Spacing` in `design-tokens.ts`)
- **Density:** Comfortable — `md` 12, `lg` 16, `xl` 20, `xxl` 24, `xxxl` 32
- **Layout primitives:** `src/design-system` (`Stack`, `Inline`, `Inset`, `Page`, `Separator`, etc.)

## Layout

- **Approach:** Grid-disciplined mobile layouts; tab navigation; cards for grouped content.
- **Border radius:** Ivy-influenced scale — `Shape.radius` from `xs` 4 through `r1` 32 (see tokens).
- **Max width:** N/A on phone; web uses standard Expo layouts.

## Motion

- **Approach:** Minimal-functional — Moti used in places (e.g. onboarding). Prefer short transitions that explain state change, not decoration.
- **Haptics:** Used on meaningful confirms (`triggerHaptic`).

## Component Rules (Binding)

From `design-tokens.ts` header — do not bypass:

1. **Opinionated over flexible** — strong defaults; no variant explosion.
2. **Semantic tokens only** — no raw hex/rgba in features.
3. **Core components:** `AppText`, `AppCard`, `AppButton`, `ListRow`, `Badge`, `Divider` — keep APIs small (~5 meaningful props).
4. **API frozen** — no new tokens/variants without a concrete product use case and preview justification.
5. **Migration:** New UI uses the system; legacy screens migrate only when touched.

## Competitive Research (2026)

- **Monarch:** Serif marketing, orange CTAs, airy landing page — lifestyle positioning.
- **Copilot:** Dark navy, dense charts, glossy "organized money" — intelligence positioning.
- **This app:** Correctness, offline ledger, Safe to Spend — should feel like a **tool**, not an ad.

## Future Direction: Ledger & Lamplight (Not Implemented)

Explored in design consultation; **not in `ThemeSchemes` yet**. Intended as a optional fifth theme for users who want maximum restraint.

| Token | Light hex | Notes |
|-------|-----------|--------|
| Canvas | `#F2EDE4` | Unbleached paper |
| Surface | `#FAF7F2` | |
| Ink | `#141210` | |
| Safe accent | `#2A6B5E` | Only Safe to Spend + primary CTA |
| Outflow | `#8B3A2A` | Parenthetical amounts |

**Typography (proposed):** Hedvig Letters Serif (labels), IBM Plex Mono tabular (all money), Instrument Sans (body).

**UX bets (proposed):**

1. Parenthetical outflows `(124.50)` instead of red arrow "insights."
2. Home screen mostly void — one Safe to Spend number, one line of obligations, single "Log transaction" CTA.

**Preview artifact:** `.context/design-research/ledger-lamplight-preview.html`

**Implementation gate:** Add `ThemeIds.LEDGER_LAMPLIGHT` + palette only after design preview and onboarding mockups justify it visually.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-26 | DESIGN.md documents shipped Deep Space default + four themes | Code audit; defaults in `UIContext` |
| 2026-07-26 | Ledger & Lamplight documented as future theme only | User chose document current + future pitch |
| 2026-07-26 | Design preview remains dev visual truth | Existing project invariant in `design-tokens.ts` |
| 2026-07-26 | Path A: no fifth theme in code yet | Deep Space remains default; Lamplight is preview/doc only |
| 2026-07-26 | Path C: token file header aligned to Deep Space default | Removed misleading Ivy-first framing in `design-tokens.ts` |
| 2026-07-26 | Home: projection always visible on dashboard | User preference; no forecast hide toggle |
