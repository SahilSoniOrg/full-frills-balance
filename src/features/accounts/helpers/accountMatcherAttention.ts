import type { AccountMatcherSnapshot, SmsRecognitionSummary } from '@/src/types/accountMatcher';
import {
  parseStoredMatcherDefinition,
  validateAccountMatcherDefinition,
} from '@/src/services/sms/recognition/accountMatcherDefinition';

const REPEATED_INDETERMINATE_THRESHOLD = 2;

/** True when a stored definition will always evaluate as indeterminate. */
export function accountMatcherDefinitionNeedsFix(matcher: AccountMatcherSnapshot): boolean {
  return !validateAccountMatcherDefinition(parseStoredMatcherDefinition(matcher.definitionJson))
    .valid;
}

/** Count recent inbox holds that named this matcher as indeterminate. */
export function countIndeterminateHoldsForMatcher(
  matcherId: string,
  recognitions: readonly (SmsRecognitionSummary | undefined)[],
): number {
  return recognitions.filter(
    recognition =>
      recognition?.hold === 'indeterminate' && recognition.matcherIds.includes(matcherId),
  ).length;
}

export function accountMatcherNeedsAttention(
  matcher: AccountMatcherSnapshot,
  recognitions: readonly (SmsRecognitionSummary | undefined)[],
): 'invalid' | 'indeterminate' | null {
  if (accountMatcherDefinitionNeedsFix(matcher)) return 'invalid';
  if (
    countIndeterminateHoldsForMatcher(matcher.id, recognitions) >= REPEATED_INDETERMINATE_THRESHOLD
  ) {
    return 'indeterminate';
  }
  return null;
}
