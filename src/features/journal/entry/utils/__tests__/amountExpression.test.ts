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
    expect(evaluateAmountExpression('2((3+1)(5-2))', 2)).toEqual({ ok: true, value: 24 });
  });

  it('supports decimal values and currency precision', () => {
    expect(evaluateAmountExpression('16.99*1.1', 2)).toEqual({ ok: true, value: 18.69 });
    expect(evaluateAmountExpression(' 1.005 + 0.005 ', 2)).toEqual({ ok: true, value: 1.01 });
    expect(evaluateAmountExpression('10/3', 2)).toEqual({ ok: true, value: 3.33 });
    expect(formatAmountExpressionValue(100.0, 2)).toBe('100');
  });

  it('evaluates subtraction and division left-to-right', () => {
    expect(evaluateAmountExpression('20-5-3', 2)).toEqual({ ok: true, value: 12 });
    expect(evaluateAmountExpression('20/5/2', 2)).toEqual({ ok: true, value: 2 });
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
    expect(evaluateAmountExpression('', 2)).toEqual({
      ok: false,
      error: 'Enter an amount',
      incomplete: true,
    });
    expect(evaluateAmountExpression('.', 2)).toEqual({
      ok: false,
      error: 'Incomplete number',
      incomplete: true,
    });
    expect(evaluateAmountExpression('1..2', 2)).toEqual({ ok: false, error: 'Invalid number' });
    expect(evaluateAmountExpression('2a', 2)).toEqual({
      ok: false,
      error: 'Unsupported character',
    });
    expect(evaluateAmountExpression('20++5', 2)).toEqual({
      ok: false,
      error: 'Invalid expression',
    });
    expect(evaluateAmountExpression('2)', 2)).toEqual({
      ok: false,
      error: 'Invalid expression',
    });
    expect(evaluateAmountExpression('20/0', 2)).toEqual({
      ok: false,
      error: 'Cannot divide by zero',
    });
  });
});
