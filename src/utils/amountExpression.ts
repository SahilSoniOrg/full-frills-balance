/**
 * Exact four-operator calculator.
 *
 * AmountCalculatorSheet uses rational arithmetic so monetary calculations
 * never depend on JavaScript floating point.
 */
export type CalculatorOperator = 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE';

export type CalculatorToken =
  { type: 'NUMBER'; raw: string } | { type: 'OPERATOR'; operator: CalculatorOperator };

export type Rational = {
  numerator: bigint;
  denominator: bigint;
};

export type CalculatorError =
  'DIVISION_BY_ZERO' | 'NEGATIVE_RESULT' | 'EXCESS_PRECISION' | 'INVALID_EXPRESSION';

export type CalculatorEvaluation = {
  formattedValue: string | null;
  detailedValue: string | null;
  error: CalculatorError | null;
  errorMessage: string | null;
  canSubmit: boolean;
};

function bigintAbs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function bigintGcd(left: bigint, right: bigint): bigint {
  let a = bigintAbs(left);
  let b = bigintAbs(right);
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function rational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) throw new Error('Cannot create a rational with a zero denominator');
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = bigintGcd(numerator, denominator);
  return {
    numerator: (numerator / divisor) * sign,
    denominator: bigintAbs(denominator) / divisor,
  };
}

function addRationals(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtractRationals(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiplyRationals(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

function divideRationals(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

function parseDecimalRational(raw: string): Rational | null {
  const normalized = raw.trim();
  const match = /^(?:(\d+)(?:\.(\d*))?|\.(\d+))$/.exec(normalized);
  if (!match) return null;

  const whole = match[1] ?? '0';
  const fraction = match[2] ?? match[3] ?? '';
  const digits = `${whole}${fraction}` || '0';
  return rational(BigInt(digits), 10n ** BigInt(fraction.length));
}

function operatorFromSymbol(symbol: string): CalculatorOperator | null {
  switch (symbol) {
    case '+':
      return 'ADD';
    case '-':
      return 'SUBTRACT';
    case '*':
      return 'MULTIPLY';
    case '/':
      return 'DIVIDE';
    default:
      return null;
  }
}

function operatorPrecedence(operator: CalculatorOperator): number {
  return operator === 'MULTIPLY' || operator === 'DIVIDE' ? 2 : 1;
}

function tokenizeCalculatorExpression(
  expression: string,
): { tokens: CalculatorToken[] } | { error: CalculatorError; errorMessage: string } {
  const normalized = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const tokens: CalculatorToken[] = [];
  let index = 0;

  while (index < normalized.length) {
    const character = normalized[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    const operator = operatorFromSymbol(character);
    if (operator) {
      tokens.push({ type: 'OPERATOR', operator });
      index += 1;
      continue;
    }

    if (character === '.' || /\d/.test(character)) {
      const start = index;
      let dotCount = 0;
      while (
        index < normalized.length &&
        (normalized[index] === '.' || /\d/.test(normalized[index]))
      ) {
        if (normalized[index] === '.') dotCount += 1;
        index += 1;
      }

      const raw = normalized.slice(start, index);
      if (dotCount > 1) {
        return { error: 'INVALID_EXPRESSION', errorMessage: 'Invalid number' };
      }
      if (raw === '.') {
        return { error: 'INVALID_EXPRESSION', errorMessage: 'Incomplete number' };
      }
      tokens.push({ type: 'NUMBER', raw });
      continue;
    }

    return { error: 'INVALID_EXPRESSION', errorMessage: 'Invalid expression' };
  }

  return { tokens };
}

function isNumberToken(
  token: CalculatorToken,
): token is Extract<CalculatorToken, { type: 'NUMBER' }> {
  return token.type === 'NUMBER';
}

type TokenFailure = { error: Extract<CalculatorError, 'DIVISION_BY_ZERO' | 'INVALID_EXPRESSION'> };

function evaluateCalculatorTokens(tokens: CalculatorToken[]): { value: Rational } | TokenFailure {
  const values: Rational[] = [];
  const operators: CalculatorOperator[] = [];

  const applyTopOperator = (): TokenFailure | null => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if (!operator || !left || !right) return { error: 'INVALID_EXPRESSION' };
    if (operator === 'DIVIDE' && right.numerator === 0n) return { error: 'DIVISION_BY_ZERO' };

    switch (operator) {
      case 'ADD':
        values.push(addRationals(left, right));
        break;
      case 'SUBTRACT':
        values.push(subtractRationals(left, right));
        break;
      case 'MULTIPLY':
        values.push(multiplyRationals(left, right));
        break;
      case 'DIVIDE':
        values.push(divideRationals(left, right));
        break;
    }
    return null;
  };

  for (const token of tokens) {
    if (isNumberToken(token)) {
      const value = parseDecimalRational(token.raw);
      if (!value) return { error: 'INVALID_EXPRESSION' };
      values.push(value);
      continue;
    }

    while (
      operators.length > 0 &&
      operatorPrecedence(operators[operators.length - 1]) >= operatorPrecedence(token.operator)
    ) {
      const failure = applyTopOperator();
      if (failure) return failure;
    }
    operators.push(token.operator);
  }

  while (operators.length > 0) {
    const failure = applyTopOperator();
    if (failure) return failure;
  }
  if (values.length !== 1) return { error: 'INVALID_EXPRESSION' };
  return { value: values[0] };
}

function roundRationalToMinorUnits(value: Rational, precision: number): bigint {
  const scale = 10n ** BigInt(precision);
  const numerator = bigintAbs(value.numerator) * scale;
  let quotient = numerator / value.denominator;
  const remainder = numerator % value.denominator;
  const doubledRemainder = remainder * 2n;

  if (
    doubledRemainder > value.denominator ||
    (doubledRemainder === value.denominator && quotient % 2n !== 0n)
  ) {
    quotient += 1n;
  }

  return value.numerator < 0n ? -quotient : quotient;
}

function formatMinorUnits(minorUnits: bigint, precision: number): string {
  const negative = minorUnits < 0n;
  const absolute = bigintAbs(minorUnits)
    .toString()
    .padStart(precision + 1, '0');
  if (precision === 0) return `${negative ? '-' : ''}${absolute}`;
  const splitAt = absolute.length - precision;
  return `${negative ? '-' : ''}${absolute.slice(0, splitAt)}.${absolute.slice(splitAt)}`;
}

export function formatRationalToCurrency(value: Rational, precision: number): string {
  return formatMinorUnits(roundRationalToMinorUnits(value, precision), precision);
}

export function formatRationalForDetails(value: Rational, maxFractionDigits = 12): string {
  const negative = value.numerator < 0n;
  let numerator = bigintAbs(value.numerator);
  const integer = numerator / value.denominator;
  let remainder = numerator % value.denominator;
  if (remainder === 0n) return `${negative ? '-' : ''}${integer}`;

  let fraction = '';
  for (let index = 0; index < maxFractionDigits && remainder !== 0n; index += 1) {
    remainder *= 10n;
    fraction += (remainder / value.denominator).toString();
    remainder %= value.denominator;
  }

  return `${negative ? '-' : ''}${integer}.${fraction}${remainder === 0n ? '' : '…'}`;
}

const TOKEN_ERROR_MESSAGES = {
  DIVISION_BY_ZERO: 'Cannot divide by zero',
  INVALID_EXPRESSION: 'Invalid expression',
} as const;

function calculatorResult(overrides: Partial<CalculatorEvaluation>): CalculatorEvaluation {
  return {
    formattedValue: null,
    detailedValue: null,
    error: null,
    errorMessage: null,
    canSubmit: false,
    ...overrides,
  };
}

/** Evaluates the calculator's four-operator grammar with exact rationals. */
export function evaluateCalculatorExpression(
  expression: string,
  precision: number,
): CalculatorEvaluation {
  const tokenized = tokenizeCalculatorExpression(expression);
  if ('error' in tokenized) {
    return calculatorResult({
      error: tokenized.error,
      errorMessage: tokenized.errorMessage,
    });
  }

  if (tokenized.tokens.length === 0) return calculatorResult({});

  for (const token of tokenized.tokens) {
    if (!isNumberToken(token)) continue;
    const fractionalDigits = token.raw.split('.')[1]?.length ?? 0;
    if (fractionalDigits > precision) {
      return calculatorResult({
        error: 'EXCESS_PRECISION',
        errorMessage: `Amount supports up to ${precision} decimal places`,
      });
    }
  }

  let expectsNumber = true;
  for (const token of tokenized.tokens) {
    if (token.type === 'NUMBER') {
      if (!expectsNumber) {
        return calculatorResult({
          error: 'INVALID_EXPRESSION',
          errorMessage: 'Invalid expression',
        });
      }
      expectsNumber = false;
    } else {
      if (expectsNumber) {
        return calculatorResult({
          error: 'INVALID_EXPRESSION',
          errorMessage: 'Invalid expression',
        });
      }
      expectsNumber = true;
    }
  }

  const hasTrailingOperator = expectsNumber;
  const evaluableTokens = hasTrailingOperator ? tokenized.tokens.slice(0, -1) : tokenized.tokens;
  if (evaluableTokens.length === 0) return calculatorResult({});

  const evaluated = evaluateCalculatorTokens(evaluableTokens);
  if ('error' in evaluated) {
    return calculatorResult({
      error: evaluated.error,
      errorMessage: TOKEN_ERROR_MESSAGES[evaluated.error],
    });
  }

  const isNegative = evaluated.value.numerator < 0n;
  return calculatorResult({
    formattedValue: formatRationalToCurrency(evaluated.value, precision),
    detailedValue: formatRationalForDetails(evaluated.value),
    error: isNegative ? 'NEGATIVE_RESULT' : null,
    errorMessage: isNegative ? 'Amount cannot be negative' : null,
    canSubmit: !isNegative,
  });
}
