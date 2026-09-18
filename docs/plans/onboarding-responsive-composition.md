# Onboarding responsive composition

Status: Approved for implementation  
Date: 2026-09-19  
Targets: iOS, Android, web

## Problem

The onboarding has a strong visual identity, but several screens are composed like fixed-height posters while behaving like forms. Software keyboards and compact-height viewports remove the lower portion of those compositions, hiding actions and trust-critical links. Repeated oversized headers also make short setup questions feel longer than they are.

The fix must be a responsive composition system, not a collection of smaller margins or device-specific offsets.

## Resolved decisions

### Welcome and name entry

- The primary action must remain visible while the name input is focused.
- The welcome screen has two intentional states:
  - **Hero state:** full product promise, name entry, primary action, restore, and privacy.
  - **Input state:** compact product context with the name field and primary action positioned above the software keyboard.
- The keyboard-open state may reduce or remove the explanatory paragraph. It must not merely scale the entire hero down.
- The keyboard submit action must trigger the same behavior as the visible primary action when the input is valid.
- Restore and privacy are trust-critical. Compact-height screens must expose them through an intentional, discoverable composition, not an apparently clipped internal scroll area.

### Currency search

- Selecting a currency already unfocuses the search input and dismisses the keyboard. Preserve that behavior.
- Do not add a redundant Done control to the successful selection path.
- Improve abandoned-search behavior: clear affordance, tap/drag dismissal where platform conventions support it, and an obvious route back to the selected/default currency.
- The implementation should avoid platform-specific layout forks where a shared behavioral contract is sufficient.

### Later money-entry screens

- The primary footer action does not need to remain visible while entering amounts.
- The current Safe-to-Spend value must remain visible while users enter data because immediate feedback is the point of the flow.
- Keep the existing Safe-to-Spend formula and current-number treatment.
- Add a compact contextual second line explaining what changed from the preceding state and why, for example:
  - `₹3,000 reserved for rent`
  - `₹20,000 income expected next month`
  - `No income added — unchanged`
- This explanatory line must be derived from the actual transition, not generic decoration.
- Number updates may use subtle motion, but reduced-motion preferences must be respected.

### Responsive composition across platforms

- iOS, Android, and web share the same information hierarchy and behavioral contract; they do not need pixel-identical geometry.
- Layout priority:
  1. Required task content
  2. Primary action when required for the active task
  3. Trust and recovery actions
  4. Decorative or explanatory hero content
- Compose from available height and keyboard/inset state. Do not hard-code known device heights or add per-device offsets.
- Validate at minimum:
  - Compact: 375 × 667
  - Standard: 390 × 844
  - Large: 430 × 932
  - iOS software text and numeric keyboards
  - Android `adjustResize` behavior
  - Web with internal scrolling
  - Dynamic Type / text scaling at 120%

### Progress

- Replace poetic-only labels such as `Space`, `Now`, `Next`, `Protect`, `Reserve`, and `Clarity` with explicit progress.
- Display `Step n of total · Step name`.
- The current flow has six steps, but that count may become four, eight, or another value. Both `n` and `total` must be derived from the flow definition, never hard-coded in visual components or copy.
- The progress bar must use the same derived step model.

### Actions and copy

- Replace vague labels such as `Continue to what comes next` with concise outcome-based labels.
- Standardize optional exits by naming the skipped concept, for example `Skip income`, `Skip planned payments`, or `Skip budgets`.
- Avoid presenting a vague skip action beside a disabled primary action when one clear optional action can advance the flow.
- Preserve the calm, conversational tone without sacrificing orientation.

### Final Safe-to-Spend explanation

- Keep Safe to Spend understandable during onboarding because it is a core concept that differs from conventional finance apps.
- The final screen shows:
  - The current result
  - One plain-language definition
  - A concise calculation/breakdown
  - A question-mark information action
- The information action opens a bottom sheet containing the fuller explanation and chart.
- Do not hide the core definition in the sheet. The sheet is progressive disclosure for depth, not a substitute for baseline comprehension.
- The final page should not require users to read several paragraphs before entering the dashboard.

## Architectural expectations

- Prefer shared responsive primitives and explicit layout modes over scattered conditional margins.
- Keep keyboard behavior owned by the screen/composition layer rather than individual decorative components.
- Derive progress metadata from one flow source of truth.
- Derive Safe-to-Spend change explanations from domain state transitions or draft differences; do not duplicate financial calculations in presentation code.
- Reuse the existing modal/bottom-sheet conventions and design tokens.
- Preserve accessibility labels, test IDs, safe-area behavior, and reduced-motion support.

## Acceptance criteria

### Welcome

- With the name field focused at 375 × 667, both the input and enabled primary action are visible without scrolling.
- Keyboard submit and button press follow the same validation and navigation path.
- Restore and privacy remain discoverable on compact screens.
- No content is obscured by iOS or Android keyboards.

### Currency

- Selecting a filtered result dismisses the keyboard and leaves the selected state obvious.
- Empty or abandoned searches can be cleared and dismissed without a hidden gesture being the only route forward.

### Guided setup

- Safe to Spend remains visible during amount entry.
- Each relevant draft change updates the total and a truthful contextual explanation.
- Footer actions may be occluded during amount entry, but tapping outside or the platform-standard dismissal path restores them.
- Progress and the progress bar are generated from the current flow definition.

### Final explanation

- The baseline definition and calculation are understandable without opening the sheet.
- The question-mark action opens an accessible bottom sheet with the detailed explanation and chart.
- Closing the sheet returns focus to the information action.

### Quality

- Existing onboarding behavior and persistence remain intact.
- Add regression tests for keyboard/layout state, derived progress, transition explanation, and bottom-sheet accessibility.
- Typecheck, focused tests, and lint pass.

## Work lanes

### Lane A: welcome and compact-height composition

Own the welcome/name-entry screen and its focused keyboard state, compact-height trust actions, responsive tests, and consistent web/iOS/Android behavior.

### Lane B: guided setup and final explanation

Own dynamic progress, compact live Safe-to-Spend feedback with transition explanations, action copy, and the final progressive-disclosure bottom sheet.

### Lane C: integration verification

After A and B land, validate the complete flow across targeted viewport/keyboard states, run focused checks, and fix only integration regressions.
