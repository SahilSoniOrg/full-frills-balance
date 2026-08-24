# Journal Amount Calculator

## Status

Implemented for guided journal entry testing. The calculator is mounted only while open, commits through the existing editor setter, and does not change other journal modes.

## Goal

Replace the guided journal entry amount field's system-keyboard-first flow with a calculator keypad that can add, subtract, multiply, and divide before committing one validated amount.

## Scope

- Guided journal entry footer amount only.
- Existing ledger, validation, cross-currency, split, advanced, and bulk behavior remain unchanged.
- No expression evaluation with `eval` and no new runtime dependency.

## UX

- Tap the amount field to open a bottom-sheet calculator.
- Show the current expression and live result preview.
- Provide Ivy Wallet-style rows: `C`, parentheses, operators, digits, decimal, backspace, equals, Cancel, and Done.
- Cancel/backdrop/close discard the draft expression.
- Done commits the evaluated result through the existing `setAmount` path.
- Results are rounded to the selected currency precision.
- Implicit multiplication is supported for number/parenthesis and parenthesis/parenthesis adjacency.
- Recoverable unfinished expressions preview using arithmetic identities and balanced parentheses.
- Invalid non-positive results are visible but muted, with Done disabled.

## Implementation

1. Add a pure expression evaluator with operator precedence and validation.
2. Add focused unit tests for valid, partial, invalid, and precision-sensitive expressions.
3. Add `AmountCalculatorSheet` using the existing `ModalSurface` bottom-sheet pattern.
4. Make `SimpleFormAmountInput` open the calculator when used by the guided footer.
5. Keep the editor's existing amount setter as the only state-write path.
6. Verify guided normal-currency and cross-currency flows plus existing journal tests.

## Verification completed

- TypeScript compilation passed.
- Expo lint passed.
- Amount expression tests passed.
- Existing `useSimpleJournalEditor` tests passed.

## Research references

- YNAB: inline transaction calculator keypad with `+`, `-`, `*`, `/`, and `=`.
- Actual Budget: typed amount expressions such as `16.99*1.1`.
- Money Tracker: popup calculator opened from the transaction amount field.
- Ivy Wallet source: calculator layout puts backspace beside equals and uses one equals key in the bottom action row.
