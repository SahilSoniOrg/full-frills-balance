import {
  evaluateCalculatorExpression,
  formatRationalForDetails,
  formatRationalToCurrency,
} from '@/src/utils/amountExpression';

describe('exact calculator evaluator', () => {
  it('preserves intermediate precision and applies currency rounding only at display time', () => {
    const result = evaluateCalculatorExpression('100/3*3', 2);

    expect(result).toMatchObject({
      formattedValue: '100.00',
      detailedValue: '100',
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
    expect(evaluateCalculatorExpression('100/3', 2)).toMatchObject({
      detailedValue: '33.333333333333…',
      formattedValue: '33.33',
    });
    expect(formatRationalForDetails({ numerator: 1n, denominator: 3n }, 4)).toBe('0.3333…');
  });

  it('reports division by zero inside a larger expression', () => {
    expect(evaluateCalculatorExpression('5+10/0*2', 2)).toMatchObject({
      error: 'DIVISION_BY_ZERO',
      formattedValue: null,
      canSubmit: false,
    });
  });

  it('handles half-even ties without floating-point assumptions', () => {
    expect(formatRationalToCurrency({ numerator: 1005n, denominator: 1000n }, 2)).toBe('1.00');
    expect(formatRationalToCurrency({ numerator: 1015n, denominator: 1000n }, 2)).toBe('1.02');
    expect(formatRationalToCurrency({ numerator: 1025n, denominator: 1000n }, 2)).toBe('1.02');
    expect(formatRationalToCurrency({ numerator: 1035n, denominator: 1000n }, 2)).toBe('1.04');
  });
});
