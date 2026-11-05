import type {
  RuleCompatibility,
  SmsAccountRecognition,
  SmsRecognitionSummary,
} from '@/src/types/accountMatcher';
import { resolveAccountFlowRoles } from './accountFlowRoles';

export function summarizeSmsRecognition(
  recognition: SmsAccountRecognition,
  compatibility?: RuleCompatibility,
): SmsRecognitionSummary {
  const hold =
    compatibility === 'contradictory' || compatibility === 'indeterminate'
      ? compatibility
      : resolveAccountFlowRoles(recognition).isAmbiguous
        ? 'contradictory'
        : undefined;
  const matcherIds = [
    ...new Set(
      recognition.outcomes
        .filter(outcome => outcome.status === 'match' || outcome.status === 'indeterminate')
        .map(outcome => outcome.matcherId),
    ),
  ];
  return {
    status: recognition.status,
    accountIds: [...recognition.accountIds],
    matcherIds,
    ...(recognition.flows?.length
      ? { flows: recognition.flows.map(({ accountId, flow }) => ({ accountId, flow })) }
      : {}),
    ...(hold ? { hold } : {}),
  };
}
