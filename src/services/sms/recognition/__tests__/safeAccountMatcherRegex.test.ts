import {
  evaluateSafeAccountMatcherRegex,
  validateSafeAccountMatcherRegex,
} from '../safeAccountMatcherRegex';

describe('safe account matcher regex', () => {
  it.each([
    ['card', 'Your CARD ending 1234', 'match'],
    ['^card', 'Your CARD ending 1234', 'no_match'],
    ['card$', 'Your CARD', 'match'],
    ['card$', 'Your CARD\r\n', 'no_match'],
    ['^card$', 'card\npayment', 'no_match'],
    ['^\\d{2,4}\\s?[A-Z]+$', '123 abc', 'match'],
    ['^\\x41\\u0042\\.$', 'AB.', 'match'],
    ['^[^0-9]*$', 'Card', 'match'],
    ['^a{0}b$', 'b', 'match'],
    ['^a{2,3}b$', 'ab', 'no_match'],
    ['^a{2,3}b$', 'aaaab', 'no_match'],
    ['^$', '', 'match'],
    ['^[^]$', '\n', 'match'],
  ] as const)('evaluates %s', (pattern, input, outcome) => {
    expect(validateSafeAccountMatcherRegex(pattern)).toEqual({ valid: true });
    expect(evaluateSafeAccountMatcherRegex(pattern, input)).toBe(outcome);
  });

  it.each(['a**', 'a+?', 'a{1,2}*', '\\bcard', '\\B', '\\1', '\\cA', '[z-a]', '\\u12', 'a^'])(
    'rejects unsupported or malformed syntax %s',
    pattern => {
      expect(validateSafeAccountMatcherRegex(pattern).valid).toBe(false);
      expect(evaluateSafeAccountMatcherRegex(pattern, 'card')).toBe('invalid_definition');
    },
  );
});
