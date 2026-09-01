import { AppNavigation } from '@/src/utils/navigation';
import { confirm, toast } from '@/src/utils/alerts';
import { AppButton, AppText, LoadingView } from '@/src/components/core';
import { Box } from '@/src/design-system';
import {
  readSetupDraftSnapshot,
  subscribeToSetupDraft,
} from '@/src/services/setup/launchProjection';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppearanceSetupSlice } from './AppearanceSetupSlice';
import { DeviceSetupSlice } from './DeviceSetupSlice';
import { RestoreSourceSlice } from './RestoreSourceSlice';
import { RestoreSummarySlice } from './RestoreSummarySlice';
import { startFirstRunRestoreFromDeviceName } from './SetupCoordinator';
import type { SetupSliceOutputById } from './SetupCoordinator';
import { discardUnreadableSetupDraft, loadSetupDraft } from './SetupDraftStore';
import { getRestoreAppearancePrefill, getRestoreWorkplacePrefill } from './restoreAutoOutput';
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
} from './setupTypes';
import { WorkplaceSetupSlice } from './WorkplaceSetupSlice';
import { WorkplaceSetupLayout } from '@/src/components/common/workplace-setup/WorkplaceSetupLayout';

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
  const [busy, setBusy] = useState(false);
  const [resolutionError, setResolutionError] = useState<string>();
  const draft = coordinator.getDraft();
  const action = coordinator.next();
  const slice =
    action.kind === 'present'
      ? action.sliceId
      : recipe.entries.find(entry => entry.kind === 'slice')?.sliceId;
  const resolving = action.kind === 'auto_accept' || action.kind === 'run_effect';

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
    setBusy(true);
    setResolutionError(undefined);
    try {
      await coordinator.accept(sliceId, output);
      await settle();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not continue Setup.';
      setResolutionError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setResolutionError(undefined);
    try {
      if (coordinator.next().kind !== 'finish') {
        await coordinator.accept('summary', { confirmed: true });
      }
      applySetupOutcome(await coordinator.finish(), recipe, onSwitchJourney);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not finish Setup.');
    } finally {
      setBusy(false);
    }
  };

  const discardRestore = async () => {
    setBusy(true);
    try {
      await abandonRestoreJourney(coordinator.getDraft(), recipe, onSwitchJourney);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not discard restore.');
    } finally {
      setBusy(false);
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
    setBusy(true);
    try {
      await coordinator.accept('restore_summary', { intent });
      await settle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not continue restore.');
    } finally {
      setBusy(false);
    }
  };

  const goTo = (target: SetupSliceId) => {
    if (coordinator.getDraft().acceptedSlices.includes(target)) coordinator.edit(target);
  };

  const goBack = () => {
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
  const renderSlice = () => {
    if (!slice || resolving) return null;
    switch (slice) {
      case 'device':
        return (
          <DeviceSetupSlice
            initialName={displayName}
            isCompleting={busy}
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
            isCompleting={busy}
            onContinue={output => void advance('restore_source', output)}
          />
        );
      case 'workplace':
        return (
          <WorkplaceSetupSlice
            displayName={displayName}
            initial={workplaceInitial}
            books={isRestoreJourneyId(journeyId) ? 'imported' : 'starters'}
            identityMode={recipe.workplaceIdentity}
            isCompleting={busy}
            onContinue={output => void advance('workplace', output)}
            onBack={goBack}
            onRestore={
              journeyId === 'empty_device_workplace'
                ? () => onSwitchJourney('empty_device_restore')
                : undefined
            }
          />
        );
      case 'restore_summary':
        return draft.kind === 'restore' && recipe.restoreSummary ? (
          <RestoreSummarySlice
            draft={draft}
            actions={recipe.restoreSummary}
            isCompleting={busy}
            onIntent={intent => void acceptRestoreIntent(intent)}
          />
        ) : null;
      case 'appearance':
        return (
          <AppearanceSetupSlice
            currencyCode={draft.workplace?.baseCurrency.value ?? ''}
            initial={
              ('appearance' in draft ? draft.appearance : undefined) ??
              getRestoreAppearancePrefill(draft)
            }
            isCompleting={busy}
            onContinue={output => void advance('appearance', output)}
            onBack={() => goTo('workplace')}
          />
        );
      case 'summary':
        return (
          <SetupSummarySlice
            draft={coordinator.getDraft()}
            isCompleting={busy}
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
    <View testID="setup-screen" style={{ flex: 1 }}>
      <WorkplaceSetupLayout
        currentStep={action.kind === 'present' ? action.progress.current : 1}
        totalSteps={action.kind === 'present' ? action.progress.total : 1}
        backAction={
          !resolving && (slice === 'restore_source' || slice === 'restore_summary')
            ? goBack
            : undefined
        }
        backDisabled={busy}
      >
        {resolving && resolutionError ? (
          <Box flex={1} padding="lg" justifyContent="center">
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
          </Box>
        ) : resolving ? (
          <LoadingView loading />
        ) : (
          renderSlice()
        )}
      </WorkplaceSetupLayout>
    </View>
  );
}

function UnreadableSetupDraft() {
  return (
    <View testID="setup-unreadable-draft" style={{ flex: 1 }}>
      <Box flex={1} padding="lg" justifyContent="center">
        <AppText variant="title">Setup could not be resumed</AppText>
        <AppText variant="body" color="secondary">
          The saved setup draft is invalid. Discard it to start again. Published restore books, if
          any, stay on this device until you delete them from Settings.
        </AppText>
        <AppButton variant="primary" onPress={() => discardUnreadableSetupDraft()}>
          Discard saved setup
        </AppButton>
      </Box>
    </View>
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
