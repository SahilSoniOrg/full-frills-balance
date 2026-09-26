import { AppNavigation } from '@/src/utils/navigation';
import { confirm, toast } from '@/src/utils/alerts';
import { AppButton, AppText, LoadingView } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { Box, Page, Stack } from '@/src/design-system';
import { PostedJournalImportError } from '@/src/domain/accounting/PostedJournalImportError';
import {
  readSetupDraftSnapshot,
  subscribeToSetupDraft,
} from '@/src/services/setup/launchProjection';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ScrollView } from 'react-native-gesture-handler';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppearanceSetupSlice } from './AppearanceSetupSlice';
import { DeviceSetupSlice } from './DeviceSetupSlice';
import { RestoreSourceSlice } from './RestoreSourceSlice';
import { RestoreSummarySlice } from './RestoreSummarySlice';
import { startFirstRunRestoreFromDeviceName } from './SetupCoordinator';
import type { SetupSliceOutputById } from './SetupCoordinator';
import { discardUnreadableSetupDraft, loadSetupDraft, saveSetupDraft } from './SetupDraftStore';
import { getSetupRecipe, recipeContainsSlice } from './setupRecipes';
import { SetupSummarySlice } from './SetupSummarySlice';
import { RestoreJournalRecovery } from './RestoreJournalRecovery';
import {
  applyPreparedRestoreFxSuggestions,
  editPreparedRestoreJournal,
  getPreparedRestoreWorkplaceName,
  getPreparedRestoreJournalIssues,
  ignorePreparedRestoreJournal,
  type PreparedRestoreJournalIssueView,
  type RestoreJournalLineEdit,
} from './pickRestoreSource';
import {
  abandonRestoreJourney,
  applySetupOutcome,
  createJourneyCoordinator,
  resolveSetupJourney,
  restoreLeaveNeedsConfirm,
} from './setupRuntime';
import {
  isRestoreJourneyId,
  restoreSources,
  type RestoreSetupDraft,
  type RestoreSummaryIntent,
  type SetupJourneyId,
  type SetupSliceId,
  type WorkplaceCheckpoint,
} from './setupTypes';
import { WorkplaceSetupSlice } from './WorkplaceSetupSlice';
import { WorkplaceSetupLayout } from '@/src/features/setup/components/workplace-setup/WorkplaceSetupLayout';
import { useSetupJourneyViewState } from './hooks/useSetupJourneyViewState';

function restoreSwitchForJourney(
  journeyId: SetupJourneyId,
  onSwitchJourney: (journeyId: SetupJourneyId, name?: string) => void,
): (() => void) | undefined {
  switch (journeyId) {
    case 'empty_device_workplace':
      return () => onSwitchJourney('empty_device_restore');
    case 'create_workplace':
      return () => onSwitchJourney('picker_restore');
    default:
      return undefined;
  }
}

function restoreChangesSummary(changeCount: number, workplaceCount: number): string {
  const changes = `${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`;
  const scope =
    workplaceCount > 1 ? `while restoring ${workplaceCount} workplaces` : 'during restore';
  return `We applied ${changes} ${scope}. Review the list, then continue.`;
}

function SetupJourneyScreen({
  journeyId,
  candidateName,
  onSwitchJourney,
}: {
  journeyId: SetupJourneyId;
  readonly candidateName: string;
  onSwitchJourney: (journeyId: SetupJourneyId, name?: string) => void;
}) {
  const recipe = getSetupRecipe(journeyId);
  const coordinator = useMemo(() => createJourneyCoordinator(journeyId), [journeyId]);

  useSyncExternalStore(subscribeToSetupDraft, readSetupDraftSnapshot, readSetupDraftSnapshot);
  const [submittingSlice, setSubmittingSlice] = useState<SetupSliceId>();
  const [resolutionError, setResolutionError] = useState<string>();
  const [restoreJournalFailure, setRestoreJournalFailure] = useState<{
    error: PostedJournalImportError;
    entries?: readonly PreparedRestoreJournalIssueView[];
    refreshing: boolean;
  }>();
  const [restoreFxRepairReport, setRestoreFxRepairReport] = useState<readonly string[]>([]);
  const restoreFxRepairReportRef = useRef<readonly string[]>([]);
  const [showRestoreFxRepairCompletion, setShowRestoreFxRepairCompletion] = useState(false);
  const [restorePublicationProgress, setRestorePublicationProgress] = useState<string>();
  const draft = coordinator.getDraft();
  const action = coordinator.next();
  const slice =
    action.kind === 'present'
      ? action.sliceId
      : recipe.entries.find(entry => entry.kind === 'slice')?.sliceId;
  const resolving = action.kind === 'auto_accept' || action.kind === 'run_effect';
  const bulkRestoreCount = draft.kind === 'restore' ? restoreSources(draft).length : 0;

  const showResolutionFailure = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Could not continue Setup.';
    setResolutionError(message);
    if (draft.kind !== 'restore' || !(error instanceof PostedJournalImportError)) {
      setRestoreJournalFailure(undefined);
      return;
    }

    setRestoreJournalFailure({
      error,
      entries: restoreJournalFailure?.entries,
      refreshing: true,
    });
    void getPreparedRestoreJournalIssues(draft, error.workplaceId, error.issues)
      .then(entries => {
        setRestoreJournalFailure(current =>
          current?.error === error ? { error, entries, refreshing: false } : current,
        );
      })
      .catch(() => {
        setRestoreJournalFailure(current => (current?.error === error ? undefined : current));
      });
  };

  const resolutionToastMessage = (error: unknown, fallback: string) =>
    error instanceof PostedJournalImportError
      ? error.details || 'A journal entry needs attention.'
      : error instanceof Error
        ? error.message
        : fallback;

  const settle = async () => {
    const nextAction = await coordinator.runPendingEffect(message =>
      setRestorePublicationProgress(message),
    );
    if (nextAction.kind === 'present') {
      coordinator.present(nextAction.sliceId);
      return;
    }
    if (nextAction.kind === 'finish') {
      if (restoreFxRepairReportRef.current.length > 0) {
        setShowRestoreFxRepairCompletion(true);
        return;
      }
      applySetupOutcome(await coordinator.finish(), recipe, onSwitchJourney);
    }
  };

  const recordRestoreChanges = (changes: readonly string[]) => {
    const updated = [...restoreFxRepairReportRef.current, ...changes];
    restoreFxRepairReportRef.current = updated;
    setRestoreFxRepairReport(updated);
  };

  useEffect(() => {
    const persisted = loadSetupDraft();
    if (!persisted || persisted.journeyId !== journeyId) {
      saveSetupDraft(coordinator.getDraft());
    }
    void settle().catch(error => {
      showResolutionFailure(error);
      toast.error(resolutionToastMessage(error, 'Could not resume Setup.'));
    });
    // Resume publication or auto-accept once when this journey mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator]);

  const advance = async <K extends SetupSliceId>(
    sliceId: K,
    output: SetupSliceOutputById[K],
  ): Promise<void> => {
    setSubmittingSlice(sliceId);
    setResolutionError(undefined);
    try {
      await coordinator.accept(sliceId, output);
      await settle();
    } catch (error) {
      showResolutionFailure(error);
      toast.error(resolutionToastMessage(error, 'Could not continue Setup.'));
    } finally {
      setSubmittingSlice(undefined);
    }
  };

  const finish = async () => {
    setSubmittingSlice('summary');
    setResolutionError(undefined);
    try {
      if (coordinator.next().kind !== 'finish') {
        await coordinator.accept('summary', { confirmed: true });
      }
      if (restoreFxRepairReportRef.current.length > 0) {
        setShowRestoreFxRepairCompletion(true);
        return;
      }
      applySetupOutcome(await coordinator.finish(), recipe, onSwitchJourney);
    } catch (error) {
      showResolutionFailure(error);
      toast.error(resolutionToastMessage(error, 'Could not finish Setup.'));
    } finally {
      setSubmittingSlice(undefined);
    }
  };

  const discardRestore = async () => {
    setSubmittingSlice('restore_summary');
    try {
      await abandonRestoreJourney(coordinator.getDraft(), recipe, onSwitchJourney);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not discard restore.');
    } finally {
      setSubmittingSlice(undefined);
    }
  };

  const confirmAbandonRestore = () => {
    confirm.show({
      title: 'Discard restore?',
      message: restoreLeaveNeedsConfirm(coordinator.getDraft())
        ? 'This deletes the restored workplace from this device and cannot be undone.'
        : 'This discards the prepared backup. Nothing has been saved to this device yet.',
      confirmText: 'Discard',
      destructive: true,
      onConfirm: () => {
        void discardRestore();
      },
    });
  };

  const acceptRestoreIntent = async (intent: RestoreSummaryIntent) => {
    if (intent === 'discard') {
      if (restoreLeaveNeedsConfirm(coordinator.getDraft())) confirmAbandonRestore();
      else await discardRestore();
      return;
    }
    setSubmittingSlice('restore_summary');
    try {
      await coordinator.accept('restore_summary', { intent });
      await settle();
    } catch (error) {
      showResolutionFailure(error);
      toast.error(resolutionToastMessage(error, 'Could not continue restore.'));
    } finally {
      setSubmittingSlice(undefined);
    }
  };

  const retryRestore = async () => {
    setSubmittingSlice('restore_source');
    setResolutionError(undefined);
    setRestoreJournalFailure(undefined);
    try {
      await settle();
    } catch (error) {
      showResolutionFailure(error);
    } finally {
      setSubmittingSlice(undefined);
    }
  };

  const runRestoreJournalMutation = async (
    mutate: (
      restoreDraft: RestoreSetupDraft,
      failure: NonNullable<typeof restoreJournalFailure>,
    ) => Promise<readonly string[]>,
  ) => {
    if (draft.kind !== 'restore' || !restoreJournalFailure) return;
    const restoreDraft = draft;
    const failure = restoreJournalFailure;
    setSubmittingSlice('restore_source');
    setResolutionError(undefined);
    try {
      const changes = await mutate(restoreDraft, failure);
      const workplaceName = getPreparedRestoreWorkplaceName(
        restoreDraft,
        failure.error.workplaceId,
      );
      recordRestoreChanges(
        workplaceName ? changes.map(change => `${workplaceName} · ${change}`) : changes,
      );
      await settle();
    } catch (error) {
      showResolutionFailure(error);
    } finally {
      setSubmittingSlice(undefined);
    }
  };

  const applyRestoreJournalEdit = (journalId: string, edits: readonly RestoreJournalLineEdit[]) =>
    runRestoreJournalMutation(async (restoreDraft, failure) => [
      await editPreparedRestoreJournal(restoreDraft, failure.error.workplaceId, journalId, edits),
    ]);

  const ignoreRestoreJournal = (journalId: string) =>
    runRestoreJournalMutation(async (restoreDraft, failure) => [
      await ignorePreparedRestoreJournal(restoreDraft, failure.error.workplaceId, journalId),
    ]);

  const applyRestoreFxSuggestions = (journalIds: readonly string[]) =>
    runRestoreJournalMutation(async (restoreDraft, failure) => {
      const selectedIds = new Set(journalIds);
      const selectedIssues = failure.error.issues.filter(issue => selectedIds.has(issue.journalId));
      const result = await applyPreparedRestoreFxSuggestions(
        restoreDraft,
        failure.error.workplaceId,
        selectedIssues,
      );
      return result.changes;
    });

  const continueAfterRestoreChanges = async () => {
    setSubmittingSlice('restore_summary');
    try {
      applySetupOutcome(await coordinator.finish(), recipe, onSwitchJourney);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not finish restore.');
    } finally {
      setSubmittingSlice(undefined);
    }
  };

  const {
    workplaceTargetStep,
    setWorkplaceTargetStep,
    workplaceStep,
    setWorkplaceStep,
    setAppearancePreview,
    displayName,
    workplaceInitial,
    workplaceCheckpoint,
    displayProgress,
    appearanceInitial,
    appearanceOverride,
  } = useSetupJourneyViewState({
    journeyId,
    candidateName,
    recipe,
    draft,
    action,
    slice,
  });

  const goTo = (target: SetupSliceId, targetStep?: WorkplaceCheckpoint) => {
    setWorkplaceTargetStep(targetStep);
    if (targetStep) setWorkplaceStep(targetStep);
    if (coordinator.getDraft().acceptedSlices.includes(target)) coordinator.edit(target);
  };

  const goBack = () => {
    if (
      draft.kind === 'restore' &&
      restoreLeaveNeedsConfirm(draft) &&
      slice === 'restore_summary'
    ) {
      confirmAbandonRestore();
      return;
    }
    const result = coordinator.back();
    if (result.kind !== 'at_start') return;
    if (draft.kind === 'restore') {
      if (restoreLeaveNeedsConfirm(draft)) confirmAbandonRestore();
      else void discardRestore();
      return;
    }
    if (recipe.atStart === 'back') AppNavigation.back();
  };

  const renderSlice = () => {
    if (!slice || resolving) return null;
    switch (slice) {
      case 'device':
        return (
          <DeviceSetupSlice
            initialName={displayName}
            isCompleting={submittingSlice === 'device'}
            onContinue={output => void advance('device', output)}
            onRestore={name => {
              startFirstRunRestoreFromDeviceName(name);
              onSwitchJourney('first_run_restore');
            }}
            onPrivacyNotice={AppNavigation.toPrivacyNotice}
          />
        );
      case 'restore_source':
        return (
          <RestoreSourceSlice
            isCompleting={submittingSlice === 'restore_source'}
            onContinue={output => void advance('restore_source', output)}
          />
        );
      case 'workplace': {
        const isEditingFromSummary =
          draft.activeSlice === 'workplace' && draft.acceptedSlices.includes('summary');
        return (
          <WorkplaceSetupSlice
            initial={workplaceInitial}
            initialStep={workplaceTargetStep}
            resumeStep={workplaceTargetStep ?? workplaceStep}
            books={isRestoreJourneyId(journeyId) ? 'imported' : 'starters'}
            identityMode={recipe.workplaceIdentity}
            isCompleting={submittingSlice === 'workplace'}
            onCheckpointChange={setWorkplaceStep}
            onContinue={output => {
              setWorkplaceTargetStep(undefined);
              void advance('workplace', output);
            }}
            onBack={() => {
              setWorkplaceTargetStep(undefined);
              if (isEditingFromSummary) {
                goTo('summary');
              } else {
                goBack();
              }
            }}
            onRestore={restoreSwitchForJourney(journeyId, onSwitchJourney)}
          />
        );
      }
      case 'restore_summary':
        return draft.kind === 'restore' && recipe.restoreSummary ? (
          <RestoreSummarySlice
            draft={draft}
            actions={recipe.restoreSummary}
            isCompleting={submittingSlice === 'restore_summary'}
            onIntent={intent => void acceptRestoreIntent(intent)}
          />
        ) : null;
      case 'appearance': {
        const appearanceBackTarget: SetupSliceId =
          draft.kind === 'restore'
            ? recipeContainsSlice(recipe, 'device')
              ? 'device'
              : 'restore_summary'
            : 'workplace';
        return (
          <AppearanceSetupSlice
            currencyCode={draft.workplace?.baseCurrency.value ?? ''}
            initial={appearanceInitial}
            isCompleting={submittingSlice === 'appearance'}
            onPreviewChange={setAppearancePreview}
            onContinue={output => void advance('appearance', output)}
            onBack={() => goTo(appearanceBackTarget)}
          />
        );
      }
      case 'summary':
        return (
          <SetupSummarySlice
            draft={coordinator.getDraft()}
            isCompleting={submittingSlice === 'summary'}
            onEdit={goTo}
            onConfirm={() => void finish()}
            onBack={() =>
              goTo(recipeContainsSlice(recipe, 'appearance') ? 'appearance' : 'workplace')
            }
          />
        );
      default:
        return null;
    }
  };

  return (
    <ThemeOverride themeId={appearanceOverride?.themeId} fontId={appearanceOverride?.fontId}>
      <WorkplaceSetupLayout
        testID="setup-screen"
        currentStep={displayProgress.current}
        totalSteps={displayProgress.total}
        keyboardAvoiding={
          restoreJournalFailure !== undefined ||
          showRestoreFxRepairCompletion ||
          slice === 'device' ||
          (slice === 'workplace' && workplaceCheckpoint === 'identity')
        }
        backAction={
          !resolving && (slice === 'restore_source' || slice === 'restore_summary')
            ? goBack
            : undefined
        }
        backDisabled={submittingSlice !== undefined}
      >
        {showRestoreFxRepairCompletion ? (
          <Box flex={1} padding="lg">
            <Stack flex={1} space="md">
              <AppText variant="title">Restore changes applied</AppText>
              <AppText variant="body" color="secondary">
                {restoreChangesSummary(restoreFxRepairReport.length, bulkRestoreCount)}
              </AppText>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: Spacing.md }}
                showsVerticalScrollIndicator
                testID="restore-changes-scroll"
              >
                <Stack space="sm">
                  {restoreFxRepairReport.map((change, index) => (
                    <AppText
                      key={`${index}-${change}`}
                      testID={`restore-fx-repair-change-${index}`}
                      variant="caption"
                      color="secondary"
                    >
                      {change}
                    </AppText>
                  ))}
                </Stack>
              </ScrollView>
              <AppButton
                variant="primary"
                onPress={() => void continueAfterRestoreChanges()}
                loading={submittingSlice === 'restore_summary'}
                disabled={submittingSlice !== undefined}
              >
                Continue to restored data
              </AppButton>
            </Stack>
          </Box>
        ) : resolving && restoreJournalFailure ? (
          <Box flex={1} padding="lg">
            <RestoreJournalRecovery
              details={restoreJournalFailure.error.details}
              issues={restoreJournalFailure.entries}
              previouslyAppliedChanges={restoreFxRepairReport}
              isBusy={submittingSlice !== undefined || restoreJournalFailure.refreshing}
              onRetry={() => void retryRestore()}
              onApplyFxSuggestions={journalIds => void applyRestoreFxSuggestions(journalIds)}
              onIgnore={journalId => void ignoreRestoreJournal(journalId)}
              onSaveEdits={(journalId, edits) => void applyRestoreJournalEdit(journalId, edits)}
            />
          </Box>
        ) : resolving && resolutionError ? (
          <Box flex={1} padding="lg" justifyContent="center">
            <Stack space="md">
              <AppText variant="body" color="secondary">
                {resolutionError}
              </AppText>
              <AppButton variant="primary" onPress={() => void retryRestore()}>
                Retry
              </AppButton>
            </Stack>
          </Box>
        ) : resolving ? (
          <LoadingView
            loading
            text={
              restorePublicationProgress ??
              (bulkRestoreCount > 1 ? `Restoring workplaces (1/${bulkRestoreCount})...` : undefined)
            }
          />
        ) : (
          renderSlice()
        )}
      </WorkplaceSetupLayout>
    </ThemeOverride>
  );
}

function UnreadableSetupDraft() {
  return (
    <Page testID="setup-unreadable-draft">
      <Box flex={1} padding="lg" justifyContent="center">
        <Stack space="md">
          <AppText variant="title">Setup could not be resumed</AppText>
          <AppText variant="body" color="secondary">
            The saved setup draft is invalid. Discard it to start again. Published restore books, if
            any, stay on this device until you delete them from Settings.
          </AppText>
          <AppButton variant="primary" onPress={() => discardUnreadableSetupDraft()}>
            Discard saved setup
          </AppButton>
        </Stack>
      </Box>
    </Page>
  );
}

function SetupScreen() {
  const { mode, journey } = useLocalSearchParams<{
    mode?: string;
    journey?: string;
  }>();
  const snapshot = useSyncExternalStore(
    subscribeToSetupDraft,
    readSetupDraftSnapshot,
    readSetupDraftSnapshot,
  );
  const [journeyOverride, setJourneyOverride] = useState<SetupJourneyId>();
  const [candidateName, setCandidateName] = useState('');
  if (snapshot && !loadSetupDraft()) {
    return <UnreadableSetupDraft />;
  }
  const journeyId = resolveSetupJourney({ mode, journey }, journeyOverride);
  return (
    <SetupJourneyScreen
      key={journeyId}
      journeyId={journeyId}
      candidateName={candidateName}
      onSwitchJourney={(nextJourney, name) => {
        if (name !== undefined) setCandidateName(name);
        setJourneyOverride(nextJourney);
      }}
    />
  );
}

export default withPrivacyScope(SetupScreen);
