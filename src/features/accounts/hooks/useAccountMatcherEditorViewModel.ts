import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  AccountMatcherConflictError,
  AccountMatcherProposalUnavailableError,
  forgetAccountMatcher,
  saveAccountMatcher,
} from '@/src/services/accounts/accountMatcherCommands';
import {
  loadAccountMatcherPreviewData,
  type AccountMatcherPreviewData,
  type AccountMatcherPreviewMessage,
} from '@/src/services/accounts/accountMatcherPreviewQueries';
import {
  validateAccountMatcherDefinition,
  parseStoredMatcherDefinition,
} from '@/src/services/sms/recognition/accountMatcherDefinition';
import { validateSafeAccountMatcherRegex } from '@/src/services/sms/recognition/safeAccountMatcherRegex';
import {
  loadAccountMatcherDiscovery,
  projectAccountMatcherDiscovery,
} from '@/src/services/accounts/accountMatcherDiscoveryQueries';
import { evaluateMatcher } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import type {
  AccountMatcherDefinitionV1,
  AccountMatcherFlow,
  AccountMatcherSnapshot,
} from '@/src/types/accountMatcher';
import type { AccountId } from '@/src/types/ids';
import { getEligibleMatcherAccountIds } from '@/src/services/accounts/accountMatcherEligibility';
import type { SmsTextSpan } from '@/src/services/journal/smsTextSpans';
import { fragmentsFromSmsSpans } from '@/src/services/journal/smsTextSpans';
import { findMatcherFragmentSpans } from '@/src/services/sms/recognition/accountMatcherNormalization';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBoundWorkplaceSaveGate } from '@/src/navigation/boundWorkplace';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { buildMatcherPreviewModel } from '../helpers/buildMatcherPreviewModel';
import { useAccountMatcherOlderMessages } from './useAccountMatcherOlderMessages';

export type { AccountMatcherOverlap } from '../helpers/buildMatcherPreviewModel';

export type AccountMatcherSaveResult = 'saved' | 'invalid' | 'overlap' | 'error';

function splitFragments(value: string): string[] {
  return value
    .split('\n')
    .map(fragment => fragment.trim())
    .filter(Boolean);
}

/** Open existing conditions against a real supporting SMS, without changing those conditions. */
function representativeMessage(
  accountId: AccountId,
  definition: AccountMatcherDefinitionV1 | null,
  messages: readonly AccountMatcherPreviewMessage[],
): AccountMatcherPreviewMessage | null {
  if (!definition) return null;
  return (
    messages.find(
      message =>
        Boolean(message.rawBody) &&
        message.linkedAccountIds.includes(accountId) &&
        evaluateMatcher(
          { id: 'editor-example', accountId, definition, isEnabled: true, eligible: true },
          {
            senderAddress: message.senderAddress ?? '',
            rawBody: message.rawBody ?? '',
          },
        ).status === 'match',
    ) ?? null
  );
}

export function useAccountMatcherEditorViewModel(
  accountId: AccountId,
  matcherId?: string,
  proposalKey?: string,
) {
  const { workplaceId } = useWorkplace();
  const { assertBound } = useBoundWorkplaceSaveGate();
  const privateMode = useEffectivePrivacyMode();
  const older = useAccountMatcherOlderMessages(workplaceId);
  const loadKey = JSON.stringify([workplaceId, accountId, matcherId ?? null, proposalKey ?? null]);
  const [loaded, setLoaded] = useState<{
    key: string;
    previewData: AccountMatcherPreviewData | null;
    existingMatcher: AccountMatcherSnapshot | null;
    proposal: Awaited<ReturnType<typeof loadAccountMatcherDiscovery>>['proposals'][number] | null;
    loadError: string | null;
  } | null>(null);
  const [selectedExample, setSelectedExample] = useState<AccountMatcherPreviewMessage | null>(null);
  const [sender, setSender] = useState('');
  const [flowDraft, setFlowDraft] = useState<{
    key: string;
    flow: AccountMatcherFlow | 'either';
  }>({ key: loadKey, flow: 'either' });
  const flow = flowDraft.key === loadKey ? flowDraft.flow : 'either';
  const setFlow = useCallback(
    (next: AccountMatcherFlow | 'either') => setFlowDraft({ key: loadKey, flow: next }),
    [loadKey],
  );
  const [senderWasEdited, setSenderWasEdited] = useState(Boolean(matcherId));
  const [fragmentsText, setFragmentsText] = useState('');
  const [regexMode, setRegexMode] = useState(false);
  const [regexPattern, setRegexPattern] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isLoading = loaded?.key !== loadKey;
  const previewData = loaded?.key === loadKey ? loaded.previewData : null;
  const existingMatcher = loaded?.key === loadKey ? loaded.existingMatcher : null;
  const proposal = loaded?.key === loadKey ? loaded.proposal : null;
  const loadError = loaded?.key === loadKey ? loaded.loadError : null;

  useEffect(() => {
    let active = true;
    const resetDraft = () => {
      setSelectedExample(null);
      setSender('');
      setFlow('either');
      setSenderWasEdited(Boolean(matcherId));
      setFragmentsText('');
      setRegexMode(false);
      setRegexPattern('');
      setSaveError(null);
    };
    loadAccountMatcherPreviewData(workplaceId, accountId)
      .then(loadedPreviewData => {
        if (!active) return;
        resetDraft();
        const discovery = proposalKey
          ? projectAccountMatcherDiscovery(workplaceId, accountId, loadedPreviewData)
          : null;
        const proposal = proposalKey
          ? (discovery?.proposals.find(item => item.proposalKey === proposalKey) ?? null)
          : null;
        if (proposalKey && !proposal) {
          setLoaded({
            key: loadKey,
            previewData: loadedPreviewData,
            existingMatcher: null,
            proposal: null,
            loadError: copy.proposalUnavailable,
          });
          return;
        }
        const proposalMessages =
          proposal?.examples.map(({ message }) => ({
            ...message,
            linkedAccountNames: message.linkedAccountNames ?? [],
          })) ?? [];
        const data = proposalMessages.length
          ? {
              ...loadedPreviewData,
              messages: [
                ...new Map(
                  [...proposalMessages, ...loadedPreviewData.messages].map(message => [
                    message.id,
                    message,
                  ]),
                ).values(),
              ].sort((left, right) => right.inputDate - left.inputDate),
            }
          : loadedPreviewData;
        if (matcherId) {
          const found = data.matchers.find(item => item.id === matcherId) ?? null;
          if (!found || found.accountId !== accountId) {
            setLoaded({
              key: loadKey,
              previewData: data,
              existingMatcher: null,
              proposal: null,
              loadError: copy.loadError,
            });
            return;
          }
          const definition = parseStoredMatcherDefinition(found.definitionJson);
          setFlow(definition?.flow ?? 'either');
          setSender(definition?.sender?.value ?? '');
          setSenderWasEdited(true);
          setFragmentsText(
            definition?.body?.kind === 'fragments' ? definition.body.fragments.join('\n') : '',
          );
          setRegexMode(definition?.body?.kind === 'regex');
          setRegexPattern(definition?.body?.kind === 'regex' ? definition.body.pattern : '');
          setSelectedExample(representativeMessage(accountId, definition, data.messages));
          setLoaded({
            key: loadKey,
            previewData: data,
            existingMatcher: found,
            proposal: null,
            loadError: null,
          });
          return;
        }
        if (proposal) {
          setFlow(proposal.definition.flow ?? 'either');
          setSender(proposal.definition.sender?.value ?? '');
          setSenderWasEdited(false);
          setFragmentsText(
            proposal.definition.body?.kind === 'fragments'
              ? proposal.definition.body.fragments.join('\n')
              : '',
          );
          setRegexMode(false);
          setRegexPattern('');
          setSelectedExample(
            representativeMessage(accountId, proposal.definition, proposalMessages),
          );
        }
        setLoaded({
          key: loadKey,
          previewData: data,
          existingMatcher: null,
          proposal,
          loadError: null,
        });
      })
      .catch(() => {
        if (active) {
          resetDraft();
          setLoaded({
            key: loadKey,
            previewData: null,
            existingMatcher: null,
            proposal: null,
            loadError: copy.loadError,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [accountId, loadKey, matcherId, proposalKey, setFlow, workplaceId]);

  // Both the saved definition and navigation/overlap guard derive from this draft.
  const draft = useMemo(
    () => ({
      sender,
      flow,
      body: regexMode
        ? { kind: 'regex' as const, pattern: regexPattern }
        : { kind: 'fragments' as const, text: fragmentsText },
      selectedMessageId: selectedExample?.id,
    }),
    [sender, flow, regexMode, regexPattern, fragmentsText, selectedExample?.id],
  );
  const draftFingerprint = useMemo(() => JSON.stringify(draft), [draft]);
  const fragments = useMemo(
    () => (draft.body.kind === 'fragments' ? splitFragments(draft.body.text) : []),
    [draft],
  );
  const definition = useMemo<AccountMatcherDefinitionV1>(() => {
    const next: AccountMatcherDefinitionV1 = { version: 1 };
    if (draft.flow !== 'either') next.flow = draft.flow;
    if (draft.sender.trim()) next.sender = { op: 'contains', value: draft.sender.trim() };
    if (draft.body.kind === 'regex') {
      next.body = { kind: 'regex', pattern: draft.body.pattern.trim() };
    } else if (fragments.length) next.body = { kind: 'fragments', fragments };
    return next;
  }, [draft, fragments]);
  // Highlight from the same original-text offsets as runtime matching. Text edits and word
  // taps therefore update one definition rather than maintaining a second selection state.
  const selectedSpans = useMemo(
    () =>
      selectedExample && !regexMode
        ? (findMatcherFragmentSpans(selectedExample.rawBody ?? '', fragments) ?? [])
        : [],
    [selectedExample, regexMode, fragments],
  );
  const validation = useMemo(() => validateAccountMatcherDefinition(definition), [definition]);
  const preview = useMemo(
    () =>
      buildMatcherPreviewModel({
        accountId,
        matcherId,
        previewData,
        existingMatcher,
        selectedExample,
        definition,
        isValid: validation.valid,
      }),
    [
      accountId,
      definition,
      existingMatcher,
      matcherId,
      previewData,
      selectedExample,
      validation.valid,
    ],
  );

  const selectMessage = useCallback(
    (message: AccountMatcherPreviewMessage) => {
      setSelectedExample(message);
      if (!senderWasEdited) setSender(message.senderAddress ?? '');
    },
    [senderWasEdited],
  );
  const changeSender = useCallback((value: string) => {
    setSenderWasEdited(true);
    setSender(value);
  }, []);
  const changeSelectedSpans = useCallback(
    (spans: SmsTextSpan[]) => {
      setFragmentsText(fragmentsFromSmsSpans(selectedExample?.rawBody ?? '', spans).join('\n'));
    },
    [selectedExample],
  );
  const changeRegexPattern = useCallback((value: string) => setRegexPattern(value), []);

  const save = useCallback(
    async (resolution?: {
      keepBoth?: boolean;
      moveMatcherId?: string;
    }): Promise<AccountMatcherSaveResult> => {
      if (!validation.valid) return 'invalid';
      if (preview.overlaps.length && !resolution) return 'overlap';
      setSaveError(null);
      setIsSaving(true);
      try {
        assertBound();
        await saveAccountMatcher(workplaceId, {
          ...(matcherId ? { id: matcherId } : {}),
          accountId,
          definition,
          ...(proposalKey ? { proposalKey } : {}),
          ...(!matcherId
            ? {
                provenance: proposalKey
                  ? 'discovered'
                  : selectedExample
                    ? 'selected_message'
                    : 'manual',
              }
            : {}),
          ...(resolution?.moveMatcherId ? { moveMatcherId: resolution.moveMatcherId } : {}),
        });
        return 'saved';
      } catch (error) {
        setSaveError(
          error instanceof AccountMatcherConflictError
            ? copy.duplicateMatcher
            : error instanceof AccountMatcherProposalUnavailableError
              ? copy.proposalUnavailable
              : copy.saveError,
        );
        return 'error';
      } finally {
        setIsSaving(false);
      }
    },
    [
      accountId,
      assertBound,
      definition,
      matcherId,
      proposalKey,
      preview.overlaps.length,
      selectedExample,
      validation.valid,
      workplaceId,
    ],
  );

  const forget = useCallback(async () => {
    if (!matcherId) return false;
    setIsSaving(true);
    setSaveError(null);
    try {
      assertBound();
      await forgetAccountMatcher(workplaceId, matcherId);
      return true;
    } catch {
      setSaveError(copy.forgetError);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [assertBound, matcherId, workplaceId]);

  const eligible = previewData
    ? getEligibleMatcherAccountIds(previewData.accounts).has(accountId)
    : false;

  return {
    accountId,
    matcherId,
    proposalKey,
    isLoading,
    isSaving,
    loadError,
    saveError,
    privateMode,
    accountName: previewData?.accounts.find(account => account.id === accountId)?.name ?? '',
    isEligible: eligible,
    sender,
    setSender: changeSender,
    flow,
    setFlow,
    fragmentsText,
    regexMode,
    setRegexMode,
    regexPattern,
    changeRegexPattern,
    regexValidation: validateSafeAccountMatcherRegex(regexPattern),
    setFragmentsText,
    fragments,
    definition,
    draftFingerprint,
    validation,
    isValid: validation.valid,
    messages: preview.messages,
    olderMessages: older.olderMessages,
    olderMessagesLoaded: older.olderMessagesLoaded,
    hasMoreOlderMessages: older.hasMoreOlderMessages,
    isLoadingOlderMessages: older.isLoadingOlderMessages,
    olderMessagesError: older.olderMessagesError,
    loadOlderMessages: older.loadOlderMessages,
    selectedExample,
    selectedSpans,
    selectedPreviewSpans: preview.selectedPreviewSpans,
    selectMessage,
    changeSelectedSpans,
    supportingExamples: preview.supportingExamples,
    allSupportingExamplesAutoPosted: preview.allSupportingExamplesAutoPosted,
    linkedMisses: preview.linkedMisses,
    overlaps: preview.overlaps,
    existingMatcher,
    proposal,
    existingCoverage: preview.existingCoverage,
    draftCoverage: preview.draftCoverage,
    inspectedCount: preview.inspectedCount,
    inspectedDates: preview.inspectedDates,
    save,
    forget,
  };
}
