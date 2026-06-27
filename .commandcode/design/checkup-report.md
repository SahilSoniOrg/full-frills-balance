# Checkup Report: Full Frills Balance

**Date**: 2026-06-27
**Score**: 45/60
**Register**: Product
**Type**: React Native / Expo personal finance app

---

## Vitals

### 1. Intentionality — 10/10 (Healthy)

The design system is highly intentional. Key evidence:

- **4 distinct themes** (Deep Space mint, Ivy purple, Editorial slate, Gold Obsidian) each with unique palette, mood, and semantic color mappings for financial concepts (income, expense, asset, liability, transfer).
- **3 font schemes** with different voices per theme — Instrument Sans + DM Serif (Deep Space), Raleway (Ivy), Inter + Crimson Text (Editorial).
- **4px grid system** enforced through `Spacing` tokens — no ad-hoc spacing.
- **Component design rules** encoded in code comments: "Opinionated over flexible", "Semantic over literal", "Visual consistency > developer convenience".
- **Living design preview screen** in `_design-preview` route — visual regression detection and taste alignment.
- **Component constraints** — ~5 prop limit per component, no variant explosion, no raw hex colors outside tokens.

**Evidence**: design-tokens.ts (946 lines), Box.tsx, Text.tsx, AppCard, AppButton all consume semantic tokens exclusively.

---

### 2. Readability — 5/10 (Watch)

**What works:**
- Type scale from 12px (xs) to 72px (hero) covers labels through massive financial amounts.
- Line heights: tight (1.2), normal (1.4), relaxed (1.6) — varied by content role.
- Letter spacing: -0.5 (tight) for headings, 0 (normal) for body.
- Body text at 16px with 1.4 line height — appropriate for mobile reading distance.
- Android font padding removed (`includeFontPadding: false`), `simple` text break strategy.
- Semantic text color tokens ensure consistent contrast.

**What needs attention:**
- **Dark mode weight compensation**: Light text on dark backgrounds reads optically thinner. The code doesn't adjust font weight for dark mode — light theme's `regular` weight may feel too thin on dark surfaces.
- **Gold Obsidian contrast**: Gold (`#D4AF37`) on dark surface (`#16181D`) may fail WCAG AA for body text. The gold works for hero amounts but secondary text needs verification.
- **Body measure**: On tablets, 400px max content width (`maxContentWidth: 400`) may create uncomfortably narrow columns for reading.
- **Long-form content**: 1.4 line height on body text is fine for financial data but would be tight for explanatory content.

**Prescription**: Run a WCAG contrast audit across all 8 theme variants (4 themes × 2 modes). Add dark mode weight step (medium→semibold for body, bold→heavier for headings). `/design recolor` for contrast fixes, `/design typeset` for dark mode typography tuning.

---

### 3. Usability — 10/10 (Healthy)

**What works:**
- Dashboard hierarchy is clear: Safe to Spend (hero) → Planned Payments → Recent Transactions (scroll).
- FAB (floating action button) at 64px in bottom-right — accessible thumb zone placement.
- Journal entry with **two modes**: Simple (guided with tabs: Income/Expense/Transfer) and Advanced (line-item breakdown). Caters to both quick-entry and detailed accounting use cases.
- Color-coded transaction types: green (income/inflow), red (expense/outflow), purple (transfer).
- Day separators with net amount + collapse toggle + reconciliation markers.
- Privacy mode toggle — replaces all amounts with "••••".
- Search accessible from dashboard header.
- Empty states with action buttons guide what to do next.
- Tab bar provides clear 5-screen mental model: Dashboard → Accounts → Commitments → Activity → Settings.

**Evidence**: DashboardScreenView.tsx, JournalEntryScreen, TabsLayout.tsx. The primary task (log a transaction, check balance, review spending) is completable in under 3 taps from any state.

---

### 4. Responsiveness — 5/10 (Watch)

**What works:**
- SafeAreaView usage with configurable `edges` prop covers notch and home indicator on modern devices.
- Status bar adapts to dark/light mode.
- Keyboard avoidance via `useKeyboard()` hook with platform-specific offset calculations.
- Flexbox-based layout throughout — adapts to screen width changes organically.
- Tab bar with active/inactive states, heavy stroke for focus.

**What needs attention:**
- **No tablet adaptations**: The app uses phone-centric layout assumptions. `maxContentWidth: 400` and card-based layout may feel stretched or empty on iPad.
- **No landscape mode considerations**: Content doesn't visibly recompose for landscape/wide layouts. The scroll-based dashboard works but doesn't take advantage of additional horizontal space.
- **No viewport gauntlet**: No evidence of testing across 320px-1440px range. The 400px max content width hardcodes a phone-optimized layout.
- **No container queries**: Components don't adapt to their container width — same card layout in sidebar vs full-width context.
- **Done button / DismissKeyboard**: Relying on keyboard avoidance, not explicit dismiss patterns.

**Prescription**: Add landscape/tablet breakpoints — split safe-to-spend chart and breakdown bar into a side-by-side layout on wider screens. Increase maxContentWidth for tablets. `/design responsive`.

---

### 5. Speed — 10/10 (Healthy)

**What works:**
- **WatermelonDB** as single source of truth (per taste: "WatermelonDB is the single source of truth for domain state") — lazy-loaded, no duplicate React state.
- **Memoization** pervasive — `useMemo` on Box styles, Text styles, processed children. Large dependency arrays in Box (30+ deps) need watching but the pattern is correct.
- **FlatList** for transaction lists — virtualized, only renders visible rows.
- **Skeleton loading** — `Skeleton.tsx` with Moti pulse animation, used in SafeToSpendCard and list views.
- **Debounced operations**: scrollDelay (100ms), data refresh (150ms), observe (200ms), pattern matching (500ms).
- **Reanimated 4.3.1** — animations run on UI thread, no JS bridge blocking.
- **No image-heavy content** — this is a text/data app, naturally fast.

**Evidence**: FlatList usage in DashboardScreenView, `Animation` constants for debounce timing, Skeleton component, WatermelonDB observation patterns.

**Note**: Two concerns flagged for monitoring: (1) Box component's `useMemo` dependency array has 30+ entries — may negate memo benefit in hot render paths. (2) Large transaction datasets (>10k entries) need FlatList optimization verification (windowSize, getItemLayout).

---

### 6. Accessibility — 5/10 (Watch)

**What works:**
- **Touch targets**: Minimum 44pt defined in `Size.touchTarget` (44) and `Size.touchTargetLg` (48). Exceeds WCAG 2.1 minimum.
- **Safe area handling**: `env(safe-area-inset-*)` via react-native-safe-area-context.
- **Dark mode**: Full dark mode support with dedicated palettes.
- **Status bar**: Auto-adapts `light`/`dark` based on theme mode.
- **Contrast utility**: `onContrast()` function available for WCAG adjustments.
- **Privacy mode**: Toggle to protect sensitive financial data.

**What needs attention:**
- **Screen reader labels**: `AppIcon` and `IconButton` don't appear to expose `accessibilityLabel`. Icon-only controls (settings cog, info buttons, close X) are silent to TalkBack/VoiceOver.
- **Reduce motion**: No `prefers-reduced-motion` check. Moti pulse skeleton animations and entrance animations lack reduced-motion alternatives.
- **Color-blind simulation**: No evidence of deuteranopia/protanopia/tritanopia testing. Red/green income expense coding is the most common color vision deficiency pairing.
- **Focus management**: No visible focus ring system or programmatic focus handling for modal/dialog open/close.
- **Keyboard navigation**: No visible keyboard navigation path — essential for switch control and external keyboard users.
- **Form labeling**: Input fields may rely on placeholder only rather than explicit `accessibilityLabel`.

**Prescription**: Add `accessibilityLabel` to all icon-only controls. Implement `AccessibilityInfo` / `useReducedMotion` hook to disable skeleton pulse animations. Swap red/green for shape+color coding (underline/badge+color). `/design interaction` for focus management and keyboard navigation.

---

## Summary

| Vital | Score | Status |
|---|---|---|
| Intentionality | 10/10 | ✅ Healthy |
| Readability | 5/10 | ⚠️ Watch |
| Usability | 10/10 | ✅ Healthy |
| Responsiveness | 5/10 | ⚠️ Watch |
| Speed | 10/10 | ✅ Healthy |
| Accessibility | 5/10 | ⚠️ Watch |
| **Total** | **45/60** | **Healthy with gaps** |

## Prescriptions

1. **Critical**: Accessibility labels on icon-only controls. This is the highest-impact fix — TalkBack/VoiceOver users cannot navigate the app's primary controls.
2. **High**: Reduced motion support — disable skeleton pulse and entrance animations when `prefers-reduced-motion` is active.
3. **High**: Color-blind safe coding — add shape/position indicators alongside red/green color coding for income vs expense.
4. **Medium**: Dark mode weight compensation — bump body text weight by one step in dark mode.
5. **Medium**: Tablet/landscape layout adaptation — split hero chart and breakdown bar side-by-side on wider screens.
6. **Low**: Gold Obsidian contrast audit — verify gold-on-dark-surface passes WCAG AA for body text.
7. **Low**: Box memo dependency audit — reduce 30+ dep array to prevent memo invalidation in hot paths.

The app has a mature, opinionated design system with strong intentionality. The gaps are in accessibility (screen readers, motion, color-blind) and responsive adaptation (tablet/landscape), which are the two areas to prioritize for a production-quality release.
