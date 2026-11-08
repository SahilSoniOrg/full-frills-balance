import { asAccountId } from '@/src/types/ids';
import {
  conditionsKeyFor,
  parseStoredMatcherDefinition,
  validateAccountMatcherDefinition,
} from '../accountMatcherDefinition';
import {
  compileAccountMatcher,
  evaluateMatcher,
  recognizeSmsAccounts,
} from '../accountMatcherEvaluator';
import type { AccountMatcherDefinitionV1, AccountMatcherRecord } from '@/src/types/accountMatcher';

const a = asAccountId('card');
const b = asAccountId('savings');
const record = (
  id: string,
  accountId = a,
  definition: AccountMatcherDefinitionV1 | null = {
    version: 1,
    body: { kind: 'fragments', fragments: ['card', 'ending'] },
  },
): AccountMatcherRecord & { compiled: ReturnType<typeof compileAccountMatcher> } => {
  const matcher: AccountMatcherRecord = {
    id,
    accountId,
    definition,
    isEnabled: true,
    eligible: true,
  };
  return { ...matcher, compiled: compileAccountMatcher(matcher) };
};
const msg = (rawBody: string, senderAddress = 'VM-FEDBNK') => ({ rawBody, senderAddress });

describe('account matcher definitions and evaluation', () => {
  it('matches sender-only and rejects empty definitions and fragments', () => {
    expect(
      validateAccountMatcherDefinition({ version: 1, sender: { op: 'contains', value: 'fedbnk' } })
        .valid,
    ).toBe(true);
    expect(
      evaluateMatcher(
        record('s', a, { version: 1, sender: { op: 'contains', value: 'fedbnk' } }),
        msg(''),
      ).status,
    ).toBe('match');
    for (const definition of [
      { version: 1 },
      { version: 1, sender: { op: 'contains', value: '  ' } },
      { version: 1, body: { kind: 'fragments', fragments: ['  '] } },
    ])
      expect(validateAccountMatcherDefinition(definition).valid).toBe(false);
  });
  it('matches ordered fragments with gaps and repeats, rejects reversed order', () => {
    const m = record('m', a, {
      version: 1,
      body: { kind: 'fragments', fragments: ['card', 'ending', '1234'] },
    });
    expect(evaluateMatcher(m, msg('Card payment, your card is ending far away 1234')).status).toBe(
      'match',
    );
    expect(
      evaluateMatcher(
        record('r', a, { version: 1, body: { kind: 'fragments', fragments: ['foo', 'foo'] } }),
        msg('foo then foo'),
      ).status,
    ).toBe('match');
    expect(evaluateMatcher(m, msg('ending 1234 card')).status).toBe('no_match');
  });
  it('rejects a seventh phrase until the User merges or removes one', () => {
    const definition = {
      version: 1,
      body: {
        kind: 'fragments',
        fragments: ['Debited', 'card', 'ending', '1234', 'Call', 'Federal', 'Bank'],
      },
    };
    expect(validateAccountMatcherDefinition(definition).valid).toBe(false);
  });
  it('ANDs sender and body, ORs matchers, consolidates accounts, maps spans', () => {
    const m = record('m', a, {
      version: 1,
      sender: { op: 'contains', value: 'fedbnk' },
      body: { kind: 'fragments', fragments: ['CARD', '1234'] },
    });
    expect(evaluateMatcher(m, msg('card 1234', 'VM-OTHER')).status).toBe('no_match');
    const recognition = recognizeSmsAccounts(
      { matchers: [m, record('m2', a, m.definition)] },
      msg(' CARD\n  has 1234 '),
    );
    expect(recognition.status).toBe('recognized');
    expect(recognition.accountIds).toEqual([a]);
    const outcome = recognition.outcomes[0];
    if (outcome.status === 'match')
      expect(outcome.spans).toEqual([
        { start: 1, end: 5 },
        { start: 12, end: 16 },
      ]);
    expect(
      recognizeSmsAccounts(
        {
          matchers: [
            record('x', b, { version: 1, body: { kind: 'fragments', fragments: ['yes'] } }),
            record('y', a, { version: 1, body: { kind: 'fragments', fragments: ['yes'] } }),
          ],
        },
        msg('yes'),
      ).accountIds,
    ).toHaveLength(2);
  });
  it('canonicalizes equivalent conditions and distinguishes real changes', () => {
    expect(
      conditionsKeyFor({
        version: 1,
        sender: { op: 'contains', value: ' FEDBNK ' },
        body: { kind: 'fragments', fragments: ['Card  ', 'END'] },
      }),
    ).toBe(
      conditionsKeyFor({
        version: 1,
        sender: { op: 'contains', value: 'fedbnk' },
        body: { kind: 'fragments', fragments: ['card', 'end'] },
      }),
    );
    expect(conditionsKeyFor({ version: 1, sender: { op: 'contains', value: 'bank' } })).not.toBe(
      conditionsKeyFor({ version: 1, sender: { op: 'contains', value: 'fed' } }),
    );
  });
  it('invalid stored definitions are indeterminate', () => {
    expect(evaluateMatcher(record('bad', a, { version: 1 }), msg('whatever')).status).toBe(
      'indeterminate',
    );
  });
  it('parses stored matcher JSON with the definition parser', () => {
    const definition = { version: 1 as const, sender: { op: 'contains' as const, value: 'bank' } };
    expect(parseStoredMatcherDefinition(JSON.stringify(definition))).toEqual(definition);
    expect(parseStoredMatcherDefinition(JSON.stringify({ version: 1 }))).toEqual({ version: 1 });
    expect(parseStoredMatcherDefinition('{broken')).toBeNull();
    expect(parseStoredMatcherDefinition(JSON.stringify({ version: 2 }))).toBeNull();
  });
  it('accepts safe regex with preview/runtime parity and rejects catastrophic syntax', () => {
    const safe = record('rx', a, {
      version: 1,
      body: { kind: 'regex', pattern: '^card[ -]ending.{0,4}1234$' },
    });
    expect(validateAccountMatcherDefinition(safe.definition).valid).toBe(true);
    expect(evaluateMatcher(safe, msg('card-ending 1234')).status).toBe('match');
    expect(evaluateMatcher(safe, msg('card-ending 12345')).status).toBe('no_match');
    for (const pattern of ['(a+)+$', '(a|aa)+$', '(a+){1,20}', '(?=a)a', '(a)\\1', 'a{1,999}'])
      expect(
        validateAccountMatcherDefinition({ version: 1, body: { kind: 'regex', pattern } }).valid,
      ).toBe(false);
  });
  it('evaluates overlapping quantifiers without native backtracking', () => {
    const regex = (pattern: string) =>
      record('rx', a, { version: 1, body: { kind: 'regex', pattern } });
    expect(evaluateMatcher(regex('^.*a.*a.*a.*a.*a.*a.*a.*b$'), msg('a'.repeat(1000))).status).toBe(
      'no_match',
    );
    expect(
      evaluateMatcher(regex('^a{0,20}a{0,20}a{0,20}a{0,20}b$'), msg('a'.repeat(80))).status,
    ).toBe('no_match');
    expect(evaluateMatcher(regex('^a*b+c?$'), msg('AAAbbbc')).status).toBe('match');
    expect(evaluateMatcher(regex('^a*b+c?$'), msg('AAAcc')).status).toBe('no_match');
  });
  it('holds recognition when the regex work budget is exhausted', () => {
    const expensive = record('budget', a, {
      version: 1,
      body: { kind: 'regex', pattern: '.'.repeat(150) },
    });
    const recognition = recognizeSmsAccounts({ matchers: [expensive] }, msg('a'.repeat(1000)));
    expect(recognition.status).toBe('indeterminate');
    expect(recognition.outcomes).toEqual([
      { status: 'indeterminate', matcherId: 'budget', accountId: a, reason: 'regex_budget' },
    ]);
  });
});
