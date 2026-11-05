import type AccountMatcher from '@/src/data/models/AccountMatcher';
import {
  accountMatcherNeedsAttention,
  countIndeterminateHoldsForMatcher,
} from '../accountMatcherAttention';

function matcher(definition: unknown, id = 'matcher-1'): AccountMatcher {
  return {
    id,
    definitionJson: JSON.stringify(definition),
  } as AccountMatcher;
}

describe('accountMatcherAttention', () => {
  it('flags invalid definitions immediately', () => {
    expect(
      accountMatcherNeedsAttention(matcher({ version: 1, body: { kind: 'regex', pattern: '(' } }), [
        {
          status: 'indeterminate',
          accountIds: [],
          matcherIds: ['matcher-1'],
          hold: 'indeterminate',
        },
      ]),
    ).toBe('invalid');
  });

  it('flags repeated indeterminate holds for a valid matcher', () => {
    const holds = [
      {
        status: 'indeterminate' as const,
        accountIds: [],
        matcherIds: ['matcher-1'],
        hold: 'indeterminate' as const,
      },
      {
        status: 'indeterminate' as const,
        accountIds: [],
        matcherIds: ['matcher-1'],
        hold: 'indeterminate' as const,
      },
    ];
    expect(countIndeterminateHoldsForMatcher('matcher-1', holds)).toBe(2);
    expect(
      accountMatcherNeedsAttention(
        matcher({ version: 1, sender: { op: 'contains', value: 'BANK' } }),
        holds,
      ),
    ).toBe('indeterminate');
  });

  it('ignores a single indeterminate hold', () => {
    expect(
      accountMatcherNeedsAttention(
        matcher({ version: 1, sender: { op: 'contains', value: 'BANK' } }),
        [
          {
            status: 'indeterminate',
            accountIds: [],
            matcherIds: ['matcher-1'],
            hold: 'indeterminate',
          },
        ],
      ),
    ).toBeNull();
  });
});
