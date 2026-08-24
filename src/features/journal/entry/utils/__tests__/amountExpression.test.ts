import { evaluateAmountExpression, formatAmountExpressionValue } from '../amountExpression';

describe('amount expression evaluator', () => {
  it('evaluates arithmetic with normal precedence', () => {
    expect(evaluateAmountExpression('20+35*2', 2)).toEqual({ ok: true, value: 90 });
    expect(evaluateAmountExpression('(20+35)*2', 2)).toEqual({ ok: true, value: 110 });
  });

  it('supports implicit multiplication around parentheses', () => {
    expect(evaluateAmountExpression('88(42)', 2)).toEqual({ ok: true, value: 3696 });
    expect(evaluateAmountExpression('2(3+4)', 2)).toEqual({ ok: true, value: 14 });
    expect(evaluateAmountExpression('(2+3)(4+5)', 2)).toEqual({ ok: true, value: 45 });
  });

  it('supports decimal values and currency precision', () => {
    expect(evaluateAmountExpression('16.99*1.1', 2)).toEqual({ ok: true, value: 18.69 });
    expect(formatAmountExpressionValue(100.0, 2)).toBe('100');
  });

  it('uses arithmetic identities for trailing operators', () => {
    expect(evaluateAmountExpression('20+', 2)).toEqual({ ok: true, value: 20 });
    expect(evaluateAmountExpression('20-', 2)).toEqual({ ok: true, value: 20 });
    expect(evaluateAmountExpression('20*', 2)).toEqual({ ok: true, value: 20 });
    expect(evaluateAmountExpression('20/', 2)).toEqual({ ok: true, value: 20 });
    expect(evaluateAmountExpression('8*(93)*', 2)).toEqual({ ok: true, value: 744 });
    expect(evaluateAmountExpression('8+(', 2)).toEqual({ ok: true, value: 8 });
    expect(evaluateAmountExpression('8*(', 2)).toEqual({ ok: true, value: 8 });
    expect(evaluateAmountExpression('8+(93', 2)).toEqual({ ok: true, value: 101 });
    expect(evaluateAmountExpression('89(', 2)).toEqual({ ok: true, value: 89 });
  });

  it('rejects malformed expressions and division by zero', () => {
    expect(evaluateAmountExpression('20++5', 2)).toEqual({
      ok: false,
      error: 'Invalid expression',
    });
    expect(evaluateAmountExpression('20/0', 2)).toEqual({
      ok: false,
      error: 'Cannot divide by zero',
    });
  });
});
