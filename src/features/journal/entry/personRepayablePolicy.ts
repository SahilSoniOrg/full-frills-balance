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
      ? flow === 'outflow'
        ? `Tracks an IOU so ${personName} can pay you back later`
        : `Tracks an IOU for what you owe ${personName}`
      : flow === 'outflow'
        ? `Records a shared cost or gift for ${personName} without tracking debt`
        : `Records money received from ${personName} without creating a debt`,
  };
}
