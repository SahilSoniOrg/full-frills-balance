import {
  evaluateCalculatorExpression,
  evaluateAmountExpression,
  formatAmountExpressionValue,
  formatRationalForDetails,
  formatRationalToCurrency,
} from '@/src/utils/amountExpression';

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

  it.each([
    ['2 (3+4)', 14],
    ['2(3)(4)', 24],
    ['2((3+4))', 14],
    ['(2+3)(4)(5+1)', 120],
    ['(2+3)4', 20],
    ['2(3)4', 24],
    ['(2)3(4)', 24],
    ['((2))3', 6],
  ])('supports implicit multiplication across parenthesis boundaries: %s', (expression, value) => {
    expect(evaluateAmountExpression(expression, 2)).toEqual({ ok: true, value });
  });

  it.each([
    ['2()', 2],
    ['2( )', 2],
    ['2()3', 6],
    ['()2', 2],
    ['2(())', 2],
    ['2+()', 2],
    ['2-()', 2],
    ['2*()', 2],
    ['2/()', 2],
  ])('treats empty parentheses as a context-appropriate identity: %s', (expression, value) => {
    expect(evaluateAmountExpression(expression, 2)).toEqual({ ok: true, value });
  });

  it.each([
    ['2+(', 2],
    ['2+((', 2],
    ['12/(', 12],
    ['12/((', 12],
    ['((2+3)', 5],
  ])('recovers unfinished nested parentheses: %s', (expression, value) => {
    expect(evaluateAmountExpression(expression, 2)).toEqual({ ok: true, value });
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
    expect(evaluateAmountExpression('()', 2)).toEqual({
      ok: false,
      error: 'Enter an amount',
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
    expect(evaluateAmountExpression('2 3', 2)).toEqual({
      ok: false,
      error: 'Invalid expression',
    });
    expect(evaluateAmountExpression('(2+)', 2)).toEqual({
      ok: false,
      error: 'Invalid expression',
    });
    expect(evaluateAmountExpression('20/0', 2)).toEqual({
      ok: false,
      error: 'Cannot divide by zero',
    });
    expect(evaluateAmountExpression('2/(1-1)', 2)).toEqual({
      ok: false,
      error: 'Cannot divide by zero',
    });
  });
});

describe('exact calculator evaluator', () => {
  it('preserves intermediate precision and applies currency rounding only at display time', () => {
    const result = evaluateCalculatorExpression('100/3*3', 2);

    expect(result).toMatchObject({
      formattedValue: '100.00',
      detailedValue: '100',
      normalizedExpression: '100 ÷ 3 × 3',
      canSubmit: true,
      error: null,
    });
  });

  it.each([
    ['1/8', '0.12'],
    ['1/40', '0.02'],
    ['3/40', '0.08'],
    ['3/200', '0.02'],
    ['0.01/2', '0.00'],
    ['0.03/2', '0.02'],
  ])('uses half-even rounding for %s', (expression, expected) => {
    expect(evaluateCalculatorExpression(expression, 2).formattedValue).toBe(expected);
  });

  it('allows explicit zero but not an untouched expression', () => {
    expect(evaluateCalculatorExpression('', 2).canSubmit).toBe(false);
    expect(evaluateCalculatorExpression('0', 2)).toMatchObject({
      formattedValue: '0.00',
      canSubmit: true,
    });
  });

  it('keeps negative results visible while preventing submission', () => {
    expect(evaluateCalculatorExpression('100-200', 2)).toMatchObject({
      formattedValue: '-100.00',
      error: 'NEGATIVE_RESULT',
      canSubmit: false,
    });
  });

  it('normalizes trailing operators without changing the entered expression until commit', () => {
    expect(evaluateCalculatorExpression('250+', 2)).toMatchObject({
      formattedValue: '250.00',
      normalizedExpression: '250',
      incomplete: true,
      canSubmit: true,
    });
  });

  it('reports recoverable mathematical errors and rejects excess operand precision', () => {
    expect(evaluateCalculatorExpression('100/0', 2)).toMatchObject({
      error: 'DIVISION_BY_ZERO',
      errorMessage: 'Cannot divide by zero',
      canSubmit: false,
    });
    expect(evaluateCalculatorExpression('1.234', 2)).toMatchObject({
      error: 'EXCESS_PRECISION',
      canSubmit: false,
    });
  });

  it('formats exact repeating results with a bounded detail preview', () => {
    const result = evaluateCalculatorExpression('100/3', 2);
    expect(result.exactValue).not.toBeNull();
    expect(formatRationalForDetails(result.exactValue!)).toBe('33.333333333333…');
    expect(formatRationalToCurrency(result.exactValue!, 2)).toBe('33.33');
  });

  it('handles half-even ties without floating-point assumptions', () => {
    expect(formatRationalToCurrency({ numerator: 1005n, denominator: 1000n }, 2)).toBe('1.00');
    expect(formatRationalToCurrency({ numerator: 1015n, denominator: 1000n }, 2)).toBe('1.02');
    expect(formatRationalToCurrency({ numerator: 1025n, denominator: 1000n }, 2)).toBe('1.02');
    expect(formatRationalToCurrency({ numerator: 1035n, denominator: 1000n }, 2)).toBe('1.04');
  });
});
