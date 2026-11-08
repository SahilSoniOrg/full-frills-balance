import type {
  AccountMatcherContext,
  MatcherOutcome,
  SmsAccountRecognition,
} from '@/src/types/accountMatcher';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import { resolveAccountFlowRoles } from '@/src/services/sms/recognition/accountFlowRoles';

interface EmailRecognitionEvidence {
  version: 1;
  contextHash: string;
  matches: { matcherId: string; accountId: string; flow?: 'incoming' | 'outgoing' }[];
}

/** The digest contains no sender, message content, or matcher conditions in plaintext. */
function contextHash(context: AccountMatcherContext): string | undefined {
  try {
    const matchers = context.matchers
      .map(matcher => [
        matcher.id,
        matcher.accountId,
        matcher.isEnabled,
        matcher.eligible,
        matcher.definition,
      ])
      .sort((left, right) => {
        const leftId = String(left[0]);
        const rightId = String(right[0]);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      });
    const accounts = [...(context.eligibleAccountIds ?? [])].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return hashLegacySmsFingerprint(encodeURIComponent(JSON.stringify([matchers, accounts])));
  } catch {
    return undefined;
  }
}

export function buildEmailRecognitionEvidence(
  context: AccountMatcherContext,
  recognition: SmsAccountRecognition,
): EmailRecognitionEvidence | undefined {
  if (recognition.status !== 'recognized' || resolveAccountFlowRoles(recognition).isAmbiguous)
    return undefined;
  const hash = contextHash(context);
  const matches = recognition.outcomes
    .filter(
      (outcome): outcome is Extract<MatcherOutcome, { status: 'match' }> =>
        outcome.status === 'match',
    )
    .map(outcome => ({
      matcherId: outcome.matcherId,
      accountId: outcome.accountId,
      ...(outcome.flow ? { flow: outcome.flow } : {}),
    }));
  if (!hash || !matches.length || matches.length > 100) return undefined;
  return { version: 1, contextHash: hash, matches };
}

/** Restore a suggestion only while the complete matcher and Account context is unchanged. */
export function readEmailRecognitionEvidence(
  metadataJson: string | undefined,
  context: AccountMatcherContext,
): SmsAccountRecognition | undefined {
  let metadata: { emailRecognition?: unknown } | undefined;
  try {
    metadata = metadataJson
      ? (JSON.parse(metadataJson) as { emailRecognition?: unknown })
      : undefined;
  } catch {
    return undefined;
  }
  const value = metadata?.emailRecognition;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const evidence = value as Record<string, unknown>;
  const hash = contextHash(context);
  if (
    evidence.version !== 1 ||
    !hash ||
    evidence.contextHash !== hash ||
    !Array.isArray(evidence.matches) ||
    !evidence.matches.length ||
    evidence.matches.length > 100
  )
    return undefined;
  const outcomes: MatcherOutcome[] = [];
  const used = new Set<string>();
  for (const value of evidence.matches) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const match = value as Record<string, unknown>;
    if (typeof match.matcherId !== 'string' || used.has(match.matcherId)) return undefined;
    const matcher = context.matchers.find(item => item.id === match.matcherId);
    if (
      !matcher ||
      !matcher.isEnabled ||
      !matcher.eligible ||
      matcher.compiled.status !== 'ready' ||
      matcher.accountId !== match.accountId ||
      matcher.definition?.flow !== match.flow
    )
      return undefined;
    used.add(matcher.id);
    outcomes.push({
      status: 'match',
      matcherId: matcher.id,
      accountId: matcher.accountId,
      spans: [],
      ...(matcher.definition?.flow ? { flow: matcher.definition.flow } : {}),
    });
  }
  const accountIds = [...new Set(outcomes.map(outcome => outcome.accountId))];
  const flows = outcomes.flatMap(outcome =>
    outcome.status === 'match' && outcome.flow
      ? [{ accountId: outcome.accountId, flow: outcome.flow }]
      : [],
  );
  const result: SmsAccountRecognition = {
    status: 'recognized',
    accountIds,
    outcomes,
    ...(flows.length ? { flows } : {}),
  };
  return resolveAccountFlowRoles(result).isAmbiguous ? undefined : result;
}

/** Restored account/matcher IDs differ; no old hint should point into another Workplace. */
export function withoutEmailRecognitionEvidence(metadataJson?: string): string | undefined {
  if (!metadataJson) return metadataJson;
  let value: unknown;
  try {
    value = JSON.parse(metadataJson) as unknown;
  } catch {
    return metadataJson;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return metadataJson;
  const metadata = { ...value } as Record<string, unknown>;
  delete metadata.emailRecognition;
  return JSON.stringify(metadata);
}
