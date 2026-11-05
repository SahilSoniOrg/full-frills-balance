import { asAccountId } from '@/src/types/ids';
import type {
  AccountMatcherDefinitionV1,
  AccountMatcherFlow,
  AccountMatcherRecord,
} from '@/src/types/accountMatcher';
import { resolveAccountFlowRoles } from '../accountFlowRoles';
import { conditionsKeyFor, validateAccountMatcherDefinition } from '../accountMatcherDefinition';
import {
  compileAccountMatcher,
  evaluateMatcher,
  recognizeSmsAccounts,
} from '../accountMatcherEvaluator';
import { summarizeSmsRecognition } from '../smsRecognitionSummary';

const savings = asAccountId('flow-savings');
const card = asAccountId('flow-card');
const other = asAccountId('flow-other');
const message = { senderAddress: 'BANK', rawBody: 'Payment from savings to card' };
const matcher = (
  id: string,
  accountId = savings,
  flow?: AccountMatcherFlow,
  definition: AccountMatcherDefinitionV1 = {
    version: 1,
    sender: { op: 'contains', value: 'BANK' },
    ...(flow ? { flow } : {}),
  },
) => {
  const record: AccountMatcherRecord = {
    id,
    accountId,
    definition,
    isEnabled: true,
    eligible: true,
  };
  return { ...record, compiled: compileAccountMatcher(record) };
};

describe('account-relative matcher flow', () => {
  it('annotates a match without filtering on the SMS parser direction', () => {
    for (const flow of ['incoming', 'outgoing'] as const) {
      expect(evaluateMatcher(matcher(flow, savings, flow), message)).toEqual({
        status: 'match',
        matcherId: flow,
        accountId: savings,
        spans: [],
        flow,
      });
    }
    expect(evaluateMatcher(matcher('either'), message)).not.toHaveProperty('flow');
  });

  it('validates flow and preserves the exact legacy conditions key for Either', () => {
    const definition = { version: 1, sender: { op: 'contains', value: 'BANK' } };
    expect(conditionsKeyFor(definition)).toBe('{"sender":"bank","body":null}');
    expect(conditionsKeyFor({ ...definition, flow: undefined })).toBe(conditionsKeyFor(definition));
    expect(conditionsKeyFor({ ...definition, flow: 'incoming' })).not.toBe(
      conditionsKeyFor({ ...definition, flow: 'outgoing' }),
    );
    expect(validateAccountMatcherDefinition({ ...definition, flow: 'sideways' }).valid).toBe(false);
    expect(validateAccountMatcherDefinition({ version: 1, flow: 'incoming' }).valid).toBe(false);
  });

  it('deduplicates matching declarations and carries them into the persisted summary', () => {
    const recognition = recognizeSmsAccounts(
      {
        matchers: [
          matcher('incoming-1', card, 'incoming'),
          matcher('incoming-2', card, 'incoming'),
          matcher('either', card),
          { ...matcher('disabled', savings, 'outgoing'), isEnabled: false },
        ],
      },
      message,
    );
    expect(recognition.flows).toEqual([{ accountId: card, flow: 'incoming' }]);
    expect(resolveAccountFlowRoles(recognition)).toEqual({
      destinationAccountId: card,
      isAmbiguous: false,
    });
    expect(summarizeSmsRecognition(recognition).flows).toEqual(recognition.flows);
  });

  it('resolves opposite account roles while leaving Either candidates unresolved', () => {
    const recognition = recognizeSmsAccounts(
      { matchers: [matcher('from', savings, 'outgoing'), matcher('to', card, 'incoming')] },
      message,
    );
    expect(resolveAccountFlowRoles(recognition)).toEqual({
      sourceAccountId: savings,
      destinationAccountId: card,
      isAmbiguous: false,
    });
    const partial = recognizeSmsAccounts(
      { matchers: [matcher('from', savings, 'outgoing'), matcher('either', card)] },
      message,
    );
    expect(resolveAccountFlowRoles(partial)).toEqual({
      sourceAccountId: savings,
      isAmbiguous: false,
    });
  });

  it.each([
    [matcher('in', savings, 'incoming'), matcher('out', savings, 'outgoing')],
    [matcher('out-1', savings, 'outgoing'), matcher('out-2', card, 'outgoing')],
    [matcher('in-1', savings, 'incoming'), matcher('in-2', card, 'incoming')],
    [
      matcher('from', savings, 'outgoing'),
      matcher('to', card, 'incoming'),
      matcher('extra', other),
    ],
  ])('holds conflicting or oversubscribed roles for review: %#', (...matchers) => {
    const recognition = recognizeSmsAccounts({ matchers }, message);
    expect(resolveAccountFlowRoles(recognition)).toEqual({ isAmbiguous: true });
    expect(summarizeSmsRecognition(recognition).hold).toBe('contradictory');
  });

  it('never resolves roles from indeterminate recognition', () => {
    const recognition = recognizeSmsAccounts(
      {
        matchers: [
          matcher('from', savings, 'outgoing'),
          matcher('invalid', savings, undefined, { version: 1 }),
        ],
      },
      message,
    );
    expect(recognition.status).toBe('indeterminate');
    expect(resolveAccountFlowRoles(recognition)).toEqual({ isAmbiguous: false });
  });
});
