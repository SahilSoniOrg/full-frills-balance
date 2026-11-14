import { InboxProcessingStatus } from '@/src/types/enums';
import { asAccountId, asJournalId } from '@/src/types/ids';
import type { SmsWorkplaceReviewState } from '@/src/types/smsInbox';
import type { SmsRecognitionSummary } from '@/src/types/smsRecognition';
import { isRecord, parseJSONRecord } from '@/src/utils/serialization';

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readRecognition(value: unknown): SmsRecognitionSummary | undefined {
  if (!isRecord(value) || !['none', 'recognized', 'indeterminate'].includes(String(value.status)))
    return undefined;
  if (
    !Array.isArray(value.accountIds) ||
    !value.accountIds.every(id => typeof id === 'string') ||
    !Array.isArray(value.matcherIds) ||
    !value.matcherIds.every(id => typeof id === 'string')
  )
    return undefined;
  const status = value.status;
  if (status !== 'none' && status !== 'recognized' && status !== 'indeterminate') return undefined;
  return {
    status,
    accountIds: stringArray(value.accountIds).map(asAccountId),
    matcherIds: stringArray(value.matcherIds),
    hold: value.hold === 'contradictory' || value.hold === 'indeterminate' ? value.hold : undefined,
    flows: Array.isArray(value.flows)
      ? value.flows.flatMap(entry => {
          if (
            !isRecord(entry) ||
            typeof entry.accountId !== 'string' ||
            (entry.flow !== 'incoming' && entry.flow !== 'outgoing')
          )
            return [];
          return [{ accountId: asAccountId(entry.accountId), flow: entry.flow }];
        })
      : undefined,
  };
}

/** Decode each Workplace independently so a corrupt sibling cannot hide valid review state. */
export function readReviewStates(
  json: string | null | undefined,
): Record<string, SmsWorkplaceReviewState> {
  const states: Record<string, SmsWorkplaceReviewState> = {};
  for (const [workplaceId, value] of Object.entries(parseJSONRecord(json))) {
    if (!isRecord(value)) continue;
    const processingStatus = Object.values(InboxProcessingStatus).find(
      status => status === value.processingStatus,
    );
    if (!processingStatus) continue;
    states[workplaceId] = {
      processingStatus,
      duplicateJournalId:
        typeof value.duplicateJournalId === 'string'
          ? asJournalId(value.duplicateJournalId)
          : undefined,
      duplicateConfidence:
        typeof value.duplicateConfidence === 'number' && Number.isFinite(value.duplicateConfidence)
          ? value.duplicateConfidence
          : undefined,
      metadataJson: typeof value.metadataJson === 'string' ? value.metadataJson : undefined,
      suggestedSourceAccountId:
        typeof value.suggestedSourceAccountId === 'string'
          ? asAccountId(value.suggestedSourceAccountId)
          : undefined,
      suggestedCategoryAccountId:
        typeof value.suggestedCategoryAccountId === 'string'
          ? asAccountId(value.suggestedCategoryAccountId)
          : undefined,
      recognition: readRecognition(value.recognition),
    };
  }
  return states;
}
