import { roundToPrecision } from '@/src/utils/money';

export type AmountExpressionResult =
  { ok: true; value: number } | { ok: false; error: string; incomplete?: boolean };

type Operator = '+' | '-' | '*' | '/';
type Token = string | Operator | '(' | ')';

function isOperator(value: string): value is Operator {
  return value === '+' || value === '-' || value === '*' || value === '/';
}

function tokenize(expression: string): Token[] | AmountExpressionResult {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if ('+-*/'.includes(char)) {
      tokens.push(char as Operator);
      index += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push(char);
      index += 1;
      continue;
    }

    if (char === '.' || /\d/.test(char)) {
      const start = index;
      let dotCount = 0;
      while (
        index < expression.length &&
        (expression[index] === '.' || /\d/.test(expression[index]))
      ) {
        if (expression[index] === '.') dotCount += 1;
        index += 1;
      }
      if (dotCount > 1) return { ok: false, error: 'Invalid number' };
      const numberToken = expression.slice(start, index);
      if (numberToken === '.') return { ok: false, error: 'Incomplete number', incomplete: true };
      tokens.push(numberToken);
      continue;
    }

    return { ok: false, error: 'Unsupported character' };
  }

  return tokens;
}

function completeTrailingEmptyParentheses(expression: string): string {
  const trailingOpenParentheses = expression.match(/\(*$/)?.[0].length ?? 0;
  if (trailingOpenParentheses === 0) return expression;

  const prefix = expression.slice(0, -trailingOpenParentheses);
  const precedingOperator = prefix.at(-1);
  if (/\d|\)$/.test(precedingOperator || '')) return prefix;
  const identity = precedingOperator === '*' || precedingOperator === '/' ? '1' : '0';
  return `${prefix}${'('.repeat(trailingOpenParentheses)}${identity}${')'.repeat(
    trailingOpenParentheses,
  )}`;
}

function completeEmptyParentheses(expression: string): string {
  let normalized = expression;
  let previous: string;
  do {
    previous = normalized;
    normalized = normalized.replace(/\(\s*\)/g, (emptyGroup, offset: number, input: string) => {
      const prefix = input.slice(0, offset).trimEnd();
      const suffix = input.slice(offset + emptyGroup.length).trimStart();
      if (!prefix && !suffix) return '';

      const precedingToken = prefix.at(-1);
      const identity = precedingToken === '+' || precedingToken === '-' ? '0' : '1';
      return `(${identity})`;
    });
  } while (normalized !== previous);
  return normalized;
}

function insertImplicitMultiplication(tokens: Token[]): Token[] {
  const normalized: Token[] = [];
  for (const token of tokens) {
    const previous = normalized.at(-1);
    const isNumber = !isOperator(String(token)) && token !== '(' && token !== ')';
    if (previous === ')' && isNumber) normalized.push('*');
    normalized.push(token);
  }
  return normalized;
}

function balanceOpenParentheses(expression: string): string {
  let balance = 0;
  for (const char of expression) {
    if (char === '(') balance += 1;
    if (char === ')') balance -= 1;
    if (balance < 0) return expression;
  }
  return balance > 0 ? `${expression}${')'.repeat(balance)}` : expression;
}

function completeTrailingOperator(expression: string): string {
  const operator = expression.at(-1);
  if (!operator || !isOperator(operator)) return expression;
  return `${expression}${operator === '*' || operator === '/' ? '1' : '0'}`;
}

function validateTokenSequence(tokens: Token[]): AmountExpressionResult | null {
  let expectsValue = true;
  let parenthesisBalance = 0;

  for (const token of tokens) {
    if (!isOperator(String(token)) && token !== '(' && token !== ')') {
      if (!expectsValue) return { ok: false, error: 'Invalid expression' };
      expectsValue = false;
      continue;
    }

    if (token === '(') {
      // A number or closing parenthesis immediately followed by an opening
      // parenthesis is intentionally allowed as implicit multiplication.
      parenthesisBalance += 1;
      expectsValue = true;
      continue;
    }

    if (token === ')') {
      if (expectsValue || parenthesisBalance === 0) {
        return { ok: false, error: 'Invalid expression' };
      }
      parenthesisBalance -= 1;
      expectsValue = false;
      continue;
    }

    if (expectsValue) return { ok: false, error: 'Invalid expression' };
    expectsValue = true;
  }

  if (parenthesisBalance !== 0 || expectsValue) {
    return { ok: false, error: 'Incomplete expression', incomplete: true };
  }
  return null;
}

/**
 * Evaluates the deliberately small calculator grammar accepted by `tokenize`.
 * It supports the same binary operators and implicit multiplication as the
 * previous evaluator, without importing a general-purpose expression engine.
 */
function evaluateTokens(tokens: Token[]): number {
  let index = 0;

  const peek = () => tokens[index];
  const consume = () => tokens[index++];

  const parseFactor = (): number => {
    const token = consume();
    if (token === '(') {
      const value = parseExpression();
      if (consume() !== ')') throw new Error('Unbalanced parentheses');
      return value;
    }
    if (typeof token !== 'string' || isOperator(token) || token === ')') {
      throw new Error('Expected number');
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error('Invalid number');
    return value;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    while (true) {
      const token = peek();
      if (token === '*' || token === '/') {
        consume();
        const right = parseFactor();
        value = token === '*' ? value * right : value / right;
        continue;
      }
      // `2(3)` and `(2+3)(4+5)` are valid implicit multiplication.
      if (token === '(') {
        value *= parseFactor();
        continue;
      }
      return value;
    }
  };

  const parseExpression = (): number => {
    let value = parseTerm();
    while (true) {
      const token = peek();
      if (token !== '+' && token !== '-') return value;
      consume();
      const right = parseTerm();
      value = token === '+' ? value + right : value - right;
    }
  };

  const value = parseExpression();
  if (index !== tokens.length) throw new Error('Unexpected token');
  return value;
}

export function evaluateAmountExpression(
  expression: string,
  precision: number,
): AmountExpressionResult {
  const expressionWithCompletedEmptyParentheses = completeEmptyParentheses(expression);
  const normalizedExpression = balanceOpenParentheses(
    completeTrailingOperator(
      completeTrailingEmptyParentheses(expressionWithCompletedEmptyParentheses),
    ),
  );
  const tokenizedResult = tokenize(normalizedExpression);
  if (!Array.isArray(tokenizedResult)) return tokenizedResult;
  if (tokenizedResult.length === 0)
    return { ok: false, error: 'Enter an amount', incomplete: true };
  const normalizedTokens = insertImplicitMultiplication(tokenizedResult);

  const validationError = validateTokenSequence(normalizedTokens);
  if (validationError) return validationError;

  try {
    const value = evaluateTokens(normalizedTokens);
    if (!Number.isFinite(value)) {
      return {
        ok: false,
        error: normalizedExpression.includes('/') ? 'Cannot divide by zero' : 'Invalid result',
      };
    }
    return { ok: true, value: roundToPrecision(value, precision) };
  } catch {
    return { ok: false, error: 'Invalid expression' };
  }
}

export function formatAmountExpressionValue(value: number, precision: number): string {
  return String(roundToPrecision(value, precision));
}

/**
 * Exact calculator primitives.
 *
 * The legacy evaluator above is kept for callers that still accept the older
 * parenthesized expression grammar. AmountCalculatorSheet uses this smaller
 * engine so monetary calculations never depend on JavaScript floating point.
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
  exactValue: Rational | null;
  formattedValue: string | null;
  detailedValue: string | null;
  normalizedExpression: string;
  error: CalculatorError | null;
  errorMessage: string | null;
  incomplete: boolean;
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
  if (right.numerator === 0n) throw new Error('DIVISION_BY_ZERO');
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

function operatorSymbol(operator: CalculatorOperator): string {
  switch (operator) {
    case 'ADD':
      return '+';
    case 'SUBTRACT':
      return '−';
    case 'MULTIPLY':
      return '×';
    case 'DIVIDE':
      return '÷';
  }
}

function operatorPrecedence(operator: CalculatorOperator): number {
  return operator === 'MULTIPLY' || operator === 'DIVIDE' ? 2 : 1;
}

function tokenizeCalculatorExpression(
  expression: string,
):
  | { tokens: CalculatorToken[] }
  | { error: CalculatorError; errorMessage: string; incomplete?: boolean } {
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
        return {
          error: 'INVALID_EXPRESSION',
          errorMessage: 'Incomplete number',
          incomplete: true,
        };
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

function evaluateCalculatorTokens(tokens: CalculatorToken[]): Rational {
  const values: Rational[] = [];
  const operators: CalculatorOperator[] = [];

  const applyTopOperator = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if (!operator || !left || !right) throw new Error('INVALID_EXPRESSION');

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
  };

  for (const token of tokens) {
    if (isNumberToken(token)) {
      const value = parseDecimalRational(token.raw);
      if (!value) throw new Error('INVALID_EXPRESSION');
      values.push(value);
      continue;
    }

    while (
      operators.length > 0 &&
      operatorPrecedence(operators[operators.length - 1]) >= operatorPrecedence(token.operator)
    ) {
      applyTopOperator();
    }
    operators.push(token.operator);
  }

  while (operators.length > 0) applyTopOperator();
  if (values.length !== 1) throw new Error('INVALID_EXPRESSION');
  return values[0];
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

function formatCalculatorExpression(tokens: CalculatorToken[]): string {
  return tokens
    .map(token => (token.type === 'NUMBER' ? token.raw : operatorSymbol(token.operator)))
    .join(' ');
}

function calculatorResult(overrides: Partial<CalculatorEvaluation>): CalculatorEvaluation {
  return {
    exactValue: null,
    formattedValue: null,
    detailedValue: null,
    normalizedExpression: '',
    error: null,
    errorMessage: null,
    incomplete: false,
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
      incomplete: tokenized.incomplete ?? false,
    });
  }

  if (tokenized.tokens.length === 0) {
    return calculatorResult({ incomplete: true });
  }

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
  if (evaluableTokens.length === 0) return calculatorResult({ incomplete: true });

  let exactValue: Rational;
  try {
    exactValue = evaluateCalculatorTokens(evaluableTokens);
  } catch (error) {
    if (error instanceof Error && error.message === 'DIVISION_BY_ZERO') {
      return calculatorResult({
        error: 'DIVISION_BY_ZERO',
        errorMessage: 'Cannot divide by zero',
        normalizedExpression: formatCalculatorExpression(evaluableTokens),
      });
    }
    return calculatorResult({
      error: 'INVALID_EXPRESSION',
      errorMessage: 'Invalid expression',
      normalizedExpression: formatCalculatorExpression(evaluableTokens),
    });
  }

  const isNegative = exactValue.numerator < 0n;
  return calculatorResult({
    exactValue,
    formattedValue: formatRationalToCurrency(exactValue, precision),
    detailedValue: formatRationalForDetails(exactValue),
    normalizedExpression: formatCalculatorExpression(evaluableTokens),
    error: isNegative ? 'NEGATIVE_RESULT' : null,
    errorMessage: isNegative ? 'Amount cannot be negative' : null,
    incomplete: hasTrailingOperator,
    canSubmit: !isNegative,
  });
}
