import type {
  CompiledAccountMatcherRegex,
  CompiledAccountMatcherRegexToken,
} from '@/src/types/accountMatcher';

/** No groups, alternation, backreferences, or zero-width assertions inside the pattern. */
export type SafeRegexValidation = { valid: true } | { valid: false; error: string };

type Compilation =
  { valid: true; regex: CompiledAccountMatcherRegex } | { valid: false; error: string };
export type SafeRegexOutcome = 'match' | 'no_match' | 'invalid_definition' | 'regex_budget';
const MAX_QUANTIFIER = 20;
const MAX_EVALUATION_STEPS = 100_000;

/** Returns the offset after one escape, rejecting assertions and ambiguous legacy escapes. */
function escapeEnd(pattern: string, start: number, inClass: boolean): number {
  const escaped = pattern[start + 1];
  if (!escaped) return -1;
  if ('dDsSwWtnrfv\\^$.*+?()[]{}|/-'.includes(escaped) || (inClass && escaped === 'b')) {
    return start + 2;
  }
  if (escaped === '0' && !/\d/.test(pattern[start + 2] ?? '')) return start + 2;
  const hexLength = escaped === 'x' ? 2 : escaped === 'u' ? 4 : 0;
  const hex = pattern.slice(start + 2, start + 2 + hexLength);
  return hexLength && hex.length === hexLength && /^[\da-f]+$/i.test(hex)
    ? start + 2 + hexLength
    : -1;
}

function compileSafeRegex(pattern: string): Compilation {
  if (!pattern || pattern.length > 200) {
    return { valid: false, error: 'Use a regex between 1 and 200 characters.' };
  }
  const tokens: CompiledAccountMatcherRegexToken[] = [];
  const startAnchored = pattern.startsWith('^');
  let endAnchored = false;
  let offset = startAnchored ? 1 : 0;
  while (offset < pattern.length) {
    const start = offset;
    const char = pattern[offset++];
    if (char === '$' && offset === pattern.length) {
      endAnchored = true;
      break;
    }
    if (char === '\\') {
      offset = escapeEnd(pattern, start, false);
      if (offset < 0) return { valid: false, error: 'Unsupported or incomplete regex escape.' };
    } else if (char === '[') {
      if (pattern[offset] === '^') offset++;
      while (offset < pattern.length && pattern[offset] !== ']') {
        if (pattern[offset] === '\\') {
          offset = escapeEnd(pattern, offset, true);
          if (offset < 0) return { valid: false, error: 'Unsupported character class escape.' };
        } else offset++;
      }
      if (pattern[offset++] !== ']') return { valid: false, error: 'Unclosed character class.' };
    } else if ('^$()*+?{}|]'.includes(char)) {
      return {
        valid: false,
        error: 'Use literals, character classes, start/end anchors, and simple quantifiers.',
      };
    }

    // Native regex only checks one atom against one UTF-16 code unit. Repetition is evaluated
    // below with dynamic programming, never by the native backtracking engine.
    let atom: RegExp;
    try {
      atom = new RegExp(`^(?:${pattern.slice(start, offset)})$`, 'i');
    } catch {
      return { valid: false, error: 'Invalid regex syntax.' };
    }
    let min = 1;
    let max = 1;
    const quantifier = pattern[offset];
    if (quantifier === '*' || quantifier === '+' || quantifier === '?') {
      offset++;
      min = quantifier === '+' ? 1 : 0;
      max = quantifier === '?' ? 1 : Infinity;
    } else if (quantifier === '{') {
      const end = pattern.indexOf('}', offset);
      const bounds = /^(\d+)(?:,(\d+))?$/.exec(pattern.slice(offset + 1, end));
      if (end < 0 || !bounds) {
        return { valid: false, error: 'Use bounded {m,n} quantifiers or *, +, ?.' };
      }
      min = Number(bounds[1]);
      max = Number(bounds[2] ?? bounds[1]);
      if (min > max || max > MAX_QUANTIFIER) {
        return { valid: false, error: 'Quantifier bounds must be between 0 and 20.' };
      }
      offset = end + 1;
    }
    tokens.push({ atom, min, max });
  }
  return { valid: true, regex: { tokens, startAnchored, endAnchored } };
}

export function compileSafeAccountMatcherRegex(
  pattern: string,
): CompiledAccountMatcherRegex | null {
  const compiled = compileSafeRegex(pattern);
  return compiled.valid ? compiled.regex : null;
}

export function validateSafeAccountMatcherRegex(pattern: string): SafeRegexValidation {
  const result = compileSafeRegex(pattern);
  return result.valid ? { valid: true } : result;
}

/**
 * Each token scans the input once. Prefix sums identify reachable repetition starts in O(1),
 * so overlapping quantifiers cannot cause backtracking. The step cap also bounds long patterns.
 */
export function matchCompiledSafeAccountMatcherRegex(
  regex: CompiledAccountMatcherRegex,
  input: string,
): Exclude<SafeRegexOutcome, 'invalid_definition'> {
  const { tokens, startAnchored, endAnchored } = regex;
  let reachable = Array<boolean>(input.length + 1).fill(!startAnchored);
  reachable[0] = true;
  let steps = 0;
  for (const { atom, min, max } of tokens) {
    const next = Array<boolean>(input.length + 1).fill(false);
    const prefix = [0];
    let lastMismatch = 0;
    for (let end = 0; end <= input.length; end++) {
      if (++steps > MAX_EVALUATION_STEPS) return 'regex_budget';
      prefix.push(prefix[end] + (reachable[end] ? 1 : 0));
      if (end > 0 && !atom.test(input[end - 1])) lastMismatch = end;
      const lower = Math.max(lastMismatch, end - max);
      const upper = end - min;
      next[end] = upper >= lower && prefix[upper + 1] > prefix[lower];
    }
    reachable = next;
    if (!reachable.some(Boolean)) return 'no_match';
  }
  const matched = endAnchored ? reachable[input.length] : reachable.some(Boolean);
  return matched ? 'match' : 'no_match';
}

export function evaluateSafeAccountMatcherRegex(pattern: string, input: string): SafeRegexOutcome {
  const compiled = compileSafeAccountMatcherRegex(pattern);
  if (!compiled) return 'invalid_definition';
  return matchCompiledSafeAccountMatcherRegex(compiled, input);
}
