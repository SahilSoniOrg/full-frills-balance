# Journal amount calculator: package research

Date: 2026-08-25

## Conclusion

There is no obvious drop-in package that combines the exact requirements here:

- a React Native keypad that matches this app’s visual system;
- forgiving, live editing of incomplete expressions;
- implicit multiplication such as `88(42)`;
- predictable handling of trailing operators and parentheses;
- money-safe rounding and a clear invalid state.

The existing custom keypad should stay. A package could replace only the expression parser/evaluator, but it would not remove the need for an input state machine.

## Candidates

### mathjs — strongest general-purpose parser

[mathjs expression syntax](https://mathjs.org/docs/expressions/syntax.html) supports conventional arithmetic, grouping parentheses, and implicit multiplication. Its documented examples include `(1+2)(3+4)`, which maps directly to the requested `88(42)` behavior. It also exposes parse trees and supports custom bundling through its documentation.

Trade-offs:

- It is a broad math language, not a money-input component.
- Its implicit-multiplication precedence has special rules, so behavior must be locked down with tests before adopting it.
- We would still need to normalize or classify incomplete input such as `8+(` and `89(` before previewing or committing.

Verdict: viable if we want a maintained parser and accept constraining its surface area. It is the best package candidate for the evaluator layer.

### expr-eval — small and focused, but needs a normalizer

[expr-eval](https://github.com/silentmatt/expr-eval) is a mathematical expression parser/evaluator intended as a safer alternative to JavaScript `eval`. Its API parses and evaluates expressions and supports the usual arithmetic operators and parentheses.

Trade-offs:

- It does not provide the custom keypad or editing behavior.
- It expects a complete parseable expression; tolerant preview behavior would remain ours.
- The npm page reports the latest release as 2.0.2, published seven years ago: [npm package](https://www.npmjs.com/package/expr-eval).

Verdict: technically usable, but less attractive than mathjs for this feature because we would still have to implement implicit multiplication and recovery rules around it.

### math-expression-evaluator — feature-rich, but not a clean fit

[math-expression-evaluator](https://www.npmjs.com/package/math-expression-evaluator) supports basic arithmetic, parentheses, and several forms of implicit/function-like input. Its npm page reports version 2.0.7, published a year ago, and zero runtime dependencies.

Trade-offs:

- Its language is much broader than this feature needs, including trigonometry, summation/product constructs, constants, and other operators.
- That makes the accepted input surface harder to reason about for a financial amount field.
- It still does not solve the keypad, live invalid state, or incomplete-expression UX.

Verdict: possible, but not my recommendation for a constrained journal amount field.

### react-native-calculator — existing UI package, but stale and generic

[react-native-calculator](https://www.npmjs.com/package/react-native-calculator) includes `Calculator` and `CalculatorInput` components, including an accept button and configurable colors.

Trade-offs:

- The package is version 0.5.2 and the npm page reports it was last published seven years ago.
- Its layout and styling do not match the current bottom-sheet design or Ivy-inspired keypad.
- It would create more work to bend the component to this app than keeping the current small keypad.

Verdict: reject. It is a UI shortcut, not a good product fit.

### jsep — parser only

[jsep](https://ericsmekens.github.io/jsep/) is a small JavaScript expression parser that turns expressions into an AST. It is not an evaluator or calculator UI.

Verdict: unnecessary here. We would still own the evaluator and all friendly-input rules.

## Decision

Do not replace the current implementation with a calculator UI package. The custom keypad and editor remain in place, while mathjs is now used behind the evaluator boundary.

Keep the custom keypad and editor state. For the evaluator, choose one of these:

1. Keep the current input normalizer and validation rules. They constrain mathjs to `+`, `−`, `×`, `÷`, decimals, and parentheses, while preserving friendly preview behavior.
2. Use mathjs only for arithmetic evaluation. Variables, functions, statements, units, and non-money operators are rejected before evaluation.

The package boundary should remain:

```text
keypad/editor → normalized expression → evaluator → rounded amount + validation state
```

The key point: a package can evaluate expressions, but it will not decide what `8+(` should preview as, whether `89(` means `89`, whether a trailing `+` implies zero, or how to communicate an invalid amount. Those are product rules and should stay explicit in this app.

## Local repository check

The current dependency manifests do not contain `mathjs`, `expr-eval`, `jsep`, `math-expression-evaluator`, or `react-native-calculator`.
