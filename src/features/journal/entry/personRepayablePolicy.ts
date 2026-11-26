import { expectedPersonAccount, type MoneyFlow } from '@/src/domain/people/personAccountPolicy';

export function getPersonRepayablePrompt({
  flow,
  personName,
  repayable,
}: {
  flow: MoneyFlow;
  personName: string;
  repayable: boolean;
}) {
  return {
    question:
      flow === 'outflow'
        ? `Should ${personName} pay you back?`
        : `Will you pay ${personName} back?`,
    targetRole: expectedPersonAccount(flow, repayable).role,
    createsOpenItem: repayable,
    hint: repayable
      ? `Tracks an open ${flow === 'outflow' ? 'receivable' : 'payable'} for ${personName}`
      : `Records as ${personName} ${flow === 'outflow' ? 'expense' : 'income'} without an open item`,
  };
}
