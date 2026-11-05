import type {
  AccountMatcherPreviewData,
  AccountMatcherPreviewMessage,
} from '@/src/services/accounts/accountMatcherPreviewQueries';
import { getEligibleMatcherAccountIds } from '@/src/services/accounts/accountMatcherEligibility';
import { parseStoredMatcherDefinition } from '@/src/services/sms/recognition/accountMatcherDefinition';
import { evaluateMatcher } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import type {
  AccountMatcherDefinitionV1,
  AccountMatcherRecord,
  TextSpan,
} from '@/src/types/accountMatcher';
import type { AccountId } from '@/src/types/ids';
import { InboxProcessingStatus } from '@/src/types/enums';

export interface AccountMatcherOverlap {
  message: AccountMatcherPreviewMessage;
  accountNames: string[];
  matcherIds: string[];
  movableMatchers: { id: string; accountName: string }[];
}

export interface MatcherPreviewModel {
  messages: AccountMatcherPreviewMessage[];
  supportingExamples: { message: AccountMatcherPreviewMessage; spans: TextSpan[] }[];
  allSupportingExamplesAutoPosted: boolean;
  linkedMisses: AccountMatcherPreviewMessage[];
  overlaps: AccountMatcherOverlap[];
  existingCoverage: number;
  draftCoverage: number;
  inspectedCount: number;
  inspectedDates: { start: number; end: number } | null;
  selectedPreviewSpans: TextSpan[];
}

/** Coverage, misses, and overlaps for one draft. Callers own loading, selection, and saving. */
export function buildMatcherPreviewModel(input: {
  accountId: AccountId;
  matcherId?: string;
  previewData: AccountMatcherPreviewData | null;
  existingMatcher: { id: string; definitionJson: string } | null;
  selectedExample: AccountMatcherPreviewMessage | null;
  definition: AccountMatcherDefinitionV1;
  isValid: boolean;
}): MatcherPreviewModel {
  const {
    accountId,
    matcherId,
    previewData,
    existingMatcher,
    selectedExample,
    definition,
    isValid,
  } = input;
  const matcherForEvaluation: AccountMatcherRecord = {
    id: matcherId ?? 'draft-account-matcher',
    accountId,
    definition,
    isEnabled: true,
    eligible: true,
  };
  const matchesMessage = (
    message: Pick<AccountMatcherPreviewMessage, 'senderAddress' | 'rawBody'>,
  ) =>
    evaluateMatcher(matcherForEvaluation, {
      senderAddress: message.senderAddress ?? '',
      rawBody: message.rawBody ?? '',
    });
  const messages = [...(previewData?.messages ?? [])];
  if (selectedExample && !messages.some(message => message.id === selectedExample.id)) {
    messages.push(selectedExample);
  }
  messages.sort((left, right) => right.inputDate - left.inputDate);

  const supportingExamples = isValid
    ? messages.flatMap(message => {
        const result = matchesMessage(message);
        const isSelected = selectedExample?.id === message.id;
        return result.status === 'match' &&
          (isSelected || message.linkedAccountIds.includes(accountId))
          ? [{ message, spans: result.spans }]
          : [];
      })
    : [];
  const linkedMisses = isValid
    ? messages.filter(
        message =>
          message.linkedAccountIds.includes(accountId) &&
          matchesMessage(message).status !== 'match',
      )
    : [];
  const overlaps: AccountMatcherOverlap[] = [];
  if (isValid && previewData) {
    const eligibleIds = getEligibleMatcherAccountIds(previewData.accounts);
    const matcherDefinitions = previewData.matchers
      .filter(
        matcher =>
          matcher.accountId !== accountId &&
          matcher.isEnabled &&
          eligibleIds.has(matcher.accountId),
      )
      .flatMap(matcher => {
        const accountMatcher = parseStoredMatcherDefinition(matcher.definitionJson);
        return accountMatcher ? [{ matcher, definition: accountMatcher }] : [];
      });
    overlaps.push(
      ...messages.flatMap(message => {
        const linkedOtherIds = message.linkedAccountIds.filter(id => id !== accountId);
        if (!linkedOtherIds.length || matchesMessage(message).status !== 'match') return [];
        const movableMatchers = matcherDefinitions
          .filter(
            ({ matcher, definition: otherDefinition }) =>
              linkedOtherIds.includes(matcher.accountId) &&
              evaluateMatcher(
                {
                  id: matcher.id,
                  accountId: matcher.accountId,
                  definition: otherDefinition,
                  isEnabled: true,
                  eligible: true,
                },
                { senderAddress: message.senderAddress ?? '', rawBody: message.rawBody ?? '' },
              ).status === 'match',
          )
          .map(({ matcher }) => ({
            id: matcher.id,
            accountName:
              previewData.accounts.find(account => account.id === matcher.accountId)?.name ?? '',
          }));
        return [
          {
            message,
            accountNames: message.linkedAccountNames.filter(name =>
              linkedOtherIds.some(
                id => previewData.accounts.find(account => account.id === id)?.name === name,
              ),
            ),
            matcherIds: movableMatchers.map(matcher => matcher.id),
            movableMatchers,
          },
        ];
      }),
    );
  }

  const oldDefinition = existingMatcher
    ? parseStoredMatcherDefinition(existingMatcher.definitionJson)
    : null;
  const oldRecord: AccountMatcherRecord | null =
    existingMatcher && oldDefinition
      ? {
          id: existingMatcher.id,
          accountId,
          definition: oldDefinition,
          isEnabled: true,
          eligible: true,
        }
      : null;
  const existingCoverage = oldRecord
    ? messages.filter(
        message =>
          (message.linkedAccountIds.includes(accountId) || selectedExample?.id === message.id) &&
          evaluateMatcher(oldRecord, {
            senderAddress: message.senderAddress ?? '',
            rawBody: message.rawBody ?? '',
          }).status === 'match',
      ).length
    : 0;
  const dates = messages.map(message => message.inputDate).filter(Number.isFinite);
  const selectedPreview = selectedExample ? matchesMessage(selectedExample) : null;

  return {
    messages,
    supportingExamples,
    allSupportingExamplesAutoPosted: Boolean(
      supportingExamples.length &&
      supportingExamples.every(
        ({ message }) =>
          !!message.linkedJournalId &&
          message.processingStatus === InboxProcessingStatus.AUTO_POSTED,
      ),
    ),
    linkedMisses,
    overlaps,
    existingCoverage,
    draftCoverage: supportingExamples.length,
    inspectedCount: messages.length,
    inspectedDates: dates.length ? { start: Math.min(...dates), end: Math.max(...dates) } : null,
    selectedPreviewSpans: selectedPreview?.status === 'match' ? selectedPreview.spans : [],
  };
}
