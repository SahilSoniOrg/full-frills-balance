import { AppNavigation } from '@/src/utils/navigation';
import { confirm, toast } from '@/src/utils/alerts';
import { AppButton, AppText, LoadingView } from '@/src/components/core';
import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { Box, Page, Stack } from '@/src/design-system';
import {
  readSetupDraftSnapshot,
  subscribeToSetupDraft,
} from '@/src/services/setup/launchProjection';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppearanceSetupSlice } from './AppearanceSetupSlice';
import { DeviceSetupSlice } from './DeviceSetupSlice';
import { RestoreSourceSlice } from './RestoreSourceSlice';
import { RestoreSummarySlice } from './RestoreSummarySlice';
import { startFirstRunRestoreFromDeviceName } from './SetupCoordinator';
import type { SetupSliceOutputById } from './SetupCoordinator';
import { discardUnreadableSetupDraft, loadSetupDraft, saveSetupDraft } from './SetupDraftStore';
import {
  getRestoreAppearancePrefill,
  getRestoreAutoOutput,
  getRestoreWorkplacePrefill,
} from './restoreAutoOutput';
import { getSetupRecipe, recipeContainsSlice } from './setupRecipes';
import { SetupSummarySlice } from './SetupSummarySlice';
import {
  abandonRestoreJourney,
  applySetupOutcome,
  createJourneyCoordinator,
  resolveSetupJourney,
  restoreLeaveNeedsConfirm,
} from './setupRuntime';
import {
  isRestoreJourneyId,
  type RestoreSummaryIntent,
  type SetupJourneyId,
  type SetupSliceId,
  type WorkplaceCheckpoint,
} from './setupTypes';
import { WorkplaceSetupSlice } from './WorkplaceSetupSlice';
import { WorkplaceSetupLayout } from '@/src/features/setup/components/workplace-setup/WorkplaceSetupLayout';
import { resolveWorkplaceStartCheckpoint, visibleSetupProgress } from './visibleSetupProgress';

function restoreSwitchForJourney(
  journeyId: SetupJourneyId,
  displayName: string,
  onSwitchJourney: (journeyId: SetupJourneyId, name?: string) => void,
): (() => void) | undefined {
  switch (journeyId) {
    case 'empty_device_workplace':
      return () => onSwitchJourney('empty_device_restore');
    case 'first_run':
      return () => {
        startFirstRunRestoreFromDeviceName(displayName);
        onSwitchJourney('first_run_restore');
      };
    case 'create_workplace':
      return () => onSwitchJourney('picker_restore');
    default:
      return undefined;
  }
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
  const draft = coordinator.getDraft();
  const action = coordinator.next();
  const slice =
    action.kind === 'present'
      ? action.sliceId
      : recipe.entries.find(entry => entry.kind === 'slice')?.sliceId;
  const resolving = action.kind === 'auto_accept' || action.kind === 'run_effect';
  const bulkRestoreCount =
    draft.kind === 'restore' ? (draft.restore.source?.batch?.length ?? 0) + 1 : 0;

  const settle = async () => {
    const nextAction = await coordinator.runPendingEffect();
    if (nextAction.kind === 'present') {
      coordinator.present(nextAction.sliceId);
      return;
    }
    if (nextAction.kind === 'finish') {
      applySetupOutcome(await coordinator.finish(), recipe, onSwitchJourney);
    }
  };

  useEffect(() => {
    const persisted = loadSetupDraft();
    if (!persisted || persisted.journeyId !== journeyId) {
      saveSetupDraft(coordinator.getDraft());
    }
    void settle().catch(error => {
      const message = error instanceof Error ? error.message : 'Could not resume Setup.';
      setResolutionError(message);
      toast.error(message);
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
      const message = error instanceof Error ? error.message : 'Could not continue Setup.';
      setResolutionError(message);
      toast.error(message);
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
      applySetupOutcome(await coordinator.finish(), recipe, onSwitchJourney);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not finish Setup.');
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
      message: 'This deletes the imported workplace from this restore and cannot be undone.',
      confirmText: 'Discard',
      destructive: true,
      onConfirm: () => {
        void discardRestore();
      },
    });
  };

  const acceptRestoreIntent = async (intent: RestoreSummaryIntent) => {
    if (intent === 'discard') {
      confirmAbandonRestore();
      return;
    }
    setSubmittingSlice('restore_summary');
    try {
      await coordinator.accept('restore_summary', { intent });
      await settle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not continue restore.');
    } finally {
      setSubmittingSlice(undefined);
    }
  };

  const [workplaceTargetStep, setWorkplaceTargetStep] = useState<WorkplaceCheckpoint>();
  const [workplaceStep, setWorkplaceStep] = useState<WorkplaceCheckpoint>(() =>
    resolveWorkplaceStartCheckpoint({
      identityMode: recipe.workplaceIdentity,
      books: isRestoreJourneyId(journeyId) ? 'imported' : 'starters',
      initial:
        coordinator.getDraft().workplace ?? getRestoreWorkplacePrefill(coordinator.getDraft()),
    }),
  );
  const [appearancePreview, setAppearancePreview] = useState<{
    themeId: ThemeId;
    fontId: FontId;
  }>();

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

  const displayName =
    ('device' in draft ? draft.device?.displayName.value : undefined) ||
    (draft.kind === 'restore' ? draft.restore.deviceCandidate?.value : undefined) ||
    candidateName;
  const workplaceInitial = draft.workplace ?? getRestoreWorkplacePrefill(draft);
  const workplaceCheckpoint =
    slice === 'workplace' ? (workplaceTargetStep ?? workplaceStep) : undefined;
  const displayProgress =
    action.kind === 'present'
      ? visibleSetupProgress({
          recipe,
          draft,
          definitions: { getAutoOutput: getRestoreAutoOutput },
          currentSlice: action.sliceId,
          workplaceCheckpoint,
        })
      : { current: 1, total: 1, completed: 0 };
  const appearanceInitial =
    ('appearance' in draft ? draft.appearance : undefined) ?? getRestoreAppearancePrefill(draft);
  const appearanceOverride =
    appearancePreview ??
    ((slice === 'appearance' || slice === 'summary') && recipeContainsSlice(recipe, 'appearance')
      ? {
          themeId: appearanceInitial?.themeId.value ?? ThemeIds.DEEP_SPACE,
          fontId: appearanceInitial?.fontId.value ?? FontIds.DEEP_SPACE,
        }
      : undefined);
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
            onRestore={restoreSwitchForJourney(journeyId, displayName, onSwitchJourney)}
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
          slice === 'device' || (slice === 'workplace' && workplaceCheckpoint === 'identity')
        }
        backAction={
          !resolving && (slice === 'restore_source' || slice === 'restore_summary')
            ? goBack
            : undefined
        }
        backDisabled={submittingSlice !== undefined}
      >
        {resolving && resolutionError ? (
          <Box flex={1} padding="lg" justifyContent="center">
            <Stack space="md">
              <AppText variant="body" color="secondary">
                {resolutionError}
              </AppText>
              <AppButton
                variant="primary"
                onPress={() => {
                  setResolutionError(undefined);
                  void settle();
                }}
              >
                Retry
              </AppButton>
            </Stack>
          </Box>
        ) : resolving ? (
          <LoadingView
            loading
            text={
              bulkRestoreCount > 1 ? `Restoring workplaces (1/${bulkRestoreCount})...` : undefined
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
