import { evaluate } from 'mathjs';

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
      // parenthesis is intentionally allowed: mathjs treats it as implicit ×.
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

export function evaluateAmountExpression(
  expression: string,
  precision: number,
): AmountExpressionResult {
  const normalizedExpression = balanceOpenParentheses(
    completeTrailingOperator(completeTrailingEmptyParentheses(expression)),
  );
  const tokenizedResult = tokenize(normalizedExpression);
  if (!Array.isArray(tokenizedResult)) return tokenizedResult;
  if (tokenizedResult.length === 0)
    return { ok: false, error: 'Enter an amount', incomplete: true };

  const validationError = validateTokenSequence(tokenizedResult);
  if (validationError) return validationError;

  try {
    const value = Number(evaluate(normalizedExpression));
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
