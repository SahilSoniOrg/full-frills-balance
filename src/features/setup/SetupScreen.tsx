import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import { generator } from '@/src/data/database/idGenerator';
import { toast } from '@/src/utils/alerts';
import { workplaceService } from '@/src/services/WorkplaceService';
import { publishRestore } from '@/src/services/import/publishRestore';
import { LoadingView } from '@/src/components/core';
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
import { createSetupCoordinator, type SetupSliceOutputById } from './SetupCoordinator';
import { clearSetupDraft, loadSetupDraft } from './SetupDraftStore';
import { getRestoreAutoOutput } from './restoreAutoOutput';
import { loadPreparedRestore } from './pickRestoreSource';
import type { NextSetupAction } from './resolveNextSetupAction';
import { finishSetup } from './setupFinishers';
import { SetupSummarySlice } from './SetupSummarySlice';
import {
  isRestoreJourneyId,
  isSetupJourneyId,
  type RestoreSummaryIntent,
  type SetupJourneyId,
  type SetupOutcome,
  type SetupSliceId,
} from './setupTypes';
import type { WorkplaceId } from '@/src/types/ids';
import { WorkplaceSetupSlice } from './WorkplaceSetupSlice';

function visibleSlice(action: NextSetupAction, journeyId: SetupJourneyId): SetupSliceId {
  if (action.kind === 'present') return action.sliceId;
  if (action.kind === 'finish') {
    return journeyId === 'first_run_restore' ||
      journeyId === 'first_run' ||
      journeyId === 'empty_device_workplace' ||
      journeyId === 'create_workplace'
      ? 'summary'
      : 'restore_summary';
  }
  return 'restore_source';
}

function resolveJourney(
  params: { mode?: string; journey?: string },
  override?: SetupJourneyId,
): SetupJourneyId {
  if (override) return override;
  if (params.journey && isSetupJourneyId(params.journey)) return params.journey;
  if (params.mode === 'full') return 'create_workplace';
  const draft = loadSetupDraft();
  if (draft && isSetupJourneyId(draft.journeyId)) return draft.journeyId;
  return preferences.device.deviceRegistered ? 'empty_device_workplace' : 'first_run';
}

function SetupJourneyScreen({
  journeyId,
  onSwitchJourney,
}: {
  journeyId: SetupJourneyId;
  onSwitchJourney: (journeyId: SetupJourneyId) => void;
}) {
  const operationId = useMemo(() => generator() as WorkplaceId, []);
  const existingDraft = useMemo(() => {
    const draft = loadSetupDraft();
    return draft?.journeyId === journeyId ? draft : undefined;
  }, [journeyId]);
  const coordinator = useMemo(
    () =>
      createSetupCoordinator({
        journeyId,
        operationId,
        draft: existingDraft,
        resolution: {
          getAutoOutput: (sliceId, draft) =>
            getRestoreAutoOutput(sliceId, draft, { userName: preferences.userName }),
        },
        effects: {
          publishRestore: async draft => {
            const prepared = await loadPreparedRestore(draft);
            const workplace = draft.workplace;
            if (!workplace) throw new Error('Workplace corrections are missing');
            return publishRestore(prepared, {
              operationId: draft.operationId,
              corrections: {
                name: workplace.name.value,
                icon: workplace.icon.value,
                defaultCurrencyCode: workplace.baseCurrency.value,
              },
            });
          },
        },
        finish: async draft => {
          if (draft.kind === 'restore') {
            const intent = draft.restore.summary?.intent ?? 'continue';
            const workplaceId = await finishSetup(draft, {
              activate: intent === 'open' || intent === 'continue',
              applyAppearance: draft.journeyId === 'first_run_restore',
            });
            if (!workplaceId) throw new Error('Restore publication is incomplete');
            return {
              kind: 'restore_accepted',
              workplaceId,
              next: intent === 'stay' ? 'stay' : intent === 'return_to_picker' ? 'picker' : 'open',
            };
          }
          const workplaceId = await finishSetup(draft);
          if (!workplaceId) throw new Error('Workplace publication failed');
          return { kind: 'workplace_created', workplaceId };
        },
      }),
    [existingDraft, journeyId, operationId],
  );

  useSyncExternalStore(subscribeToSetupDraft, readSetupDraftSnapshot, readSetupDraftSnapshot);
  const [busy, setBusy] = useState(false);
  const draft = coordinator.getDraft();
  const action = coordinator.next();
  const slice = visibleSlice(action, journeyId);
  const resolving = action.kind === 'auto_accept' || action.kind === 'run_effect';

  const applyOutcome = (outcome: SetupOutcome) => {
    if (outcome.kind === 'workplace_created') {
      AppNavigation.toDashboard();
      return;
    }
    if (outcome.kind === 'restore_accepted') {
      if (outcome.next === 'stay') AppNavigation.toSettings();
      else AppNavigation.toDashboard();
      return;
    }
    if (outcome.kind === 'journey_discarded') {
      if (outcome.returnTo === 'first_run') onSwitchJourney('first_run');
      else if (outcome.returnTo === 'picker') AppNavigation.toDashboard();
      else if (journeyId === 'empty_device_restore') onSwitchJourney('empty_device_workplace');
      else AppNavigation.toSettings();
    }
  };

  const settle = async () => {
    const nextAction = await coordinator.runPendingEffect();
    if (nextAction.kind === 'present') {
      coordinator.present(nextAction.sliceId);
      return;
    }
    if (nextAction.kind === 'finish') {
      applyOutcome(await coordinator.finish());
    }
  };

  useEffect(() => {
    void settle().catch(error => {
      toast.error(error instanceof Error ? error.message : 'Could not resume Setup.');
    });
    // Resume publication or auto-accept once when this journey mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator]);

  const advance = async <K extends SetupSliceId>(
    sliceId: K,
    output: SetupSliceOutputById[K],
  ): Promise<void> => {
    setBusy(true);
    try {
      await coordinator.accept(sliceId, output);
      await settle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not continue Setup.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      if (coordinator.next().kind !== 'finish') {
        await coordinator.accept('summary', { confirmed: true });
      }
      applyOutcome(await coordinator.finish());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not finish Setup.');
    } finally {
      setBusy(false);
    }
  };

  const discardRestore = async () => {
    const published = draft.kind === 'restore' ? draft.restore.handoff?.workplaceId : undefined;
    if (published) await workplaceService.deleteWorkplace(published);
    clearSetupDraft();
    applyOutcome({
      kind: 'journey_discarded',
      returnTo:
        journeyId === 'first_run_restore'
          ? 'first_run'
          : journeyId === 'picker_restore'
            ? 'picker'
            : 'current_workplace',
    });
  };

  const acceptRestoreIntent = async (intent: RestoreSummaryIntent) => {
    setBusy(true);
    try {
      if (intent === 'discard') {
        await discardRestore();
        return;
      }
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
    if (result.kind === 'at_start') {
      if (journeyId === 'create_workplace' || journeyId === 'settings_restore')
        AppNavigation.back();
      else if (journeyId === 'picker_restore') {
        clearSetupDraft();
        AppNavigation.toDashboard();
      } else if (journeyId === 'first_run_restore') {
        onSwitchJourney('first_run');
      } else if (journeyId === 'empty_device_restore') {
        onSwitchJourney('empty_device_workplace');
      }
    }
  };

  const displayName = 'device' in draft ? (draft.device?.displayName.value ?? '') : '';
  const render = () => {
    switch (slice) {
      case 'device':
        return (
          <DeviceSetupSlice
            initialName={displayName}
            isCompleting={busy}
            onContinue={output => void advance('device', output)}
            onRestore={() => onSwitchJourney('first_run_restore')}
          />
        );
      case 'restore_source':
        return (
          <RestoreSourceSlice
            isCompleting={busy}
            onContinue={output => void advance('restore_source', output)}
            onBack={goBack}
          />
        );
      case 'workplace':
        return (
          <WorkplaceSetupSlice
            displayName={displayName}
            initial={draft.workplace}
            totalSteps={journeyId === 'first_run' || journeyId === 'first_run_restore' ? 6 : 5}
            books={isRestoreJourneyId(journeyId) ? 'imported' : 'starters'}
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
        return (
          <RestoreSummarySlice
            journeyId={journeyId}
            handoff={draft.kind === 'restore' ? draft.restore.handoff : undefined}
            isCompleting={busy}
            onIntent={intent => void acceptRestoreIntent(intent)}
            onBack={goBack}
          />
        );
      case 'appearance':
        return (
          <AppearanceSetupSlice
            currencyCode={draft.workplace?.baseCurrency.value ?? ''}
            initial={'appearance' in draft ? draft.appearance : undefined}
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
              goTo(
                journeyId === 'first_run' || journeyId === 'first_run_restore'
                  ? 'appearance'
                  : 'workplace',
              )
            }
          />
        );
      default:
        return null;
    }
  };

  return (
    <View testID="setup-screen" style={{ flex: 1 }}>
      {resolving ? <LoadingView loading /> : render()}
    </View>
  );
}

function SetupScreen() {
  const { mode, journey } = useLocalSearchParams<{
    mode?: string;
    journey?: string;
  }>();
  const [journeyOverride, setJourneyOverride] = useState<SetupJourneyId>();
  const journeyId = resolveJourney({ mode, journey }, journeyOverride);
  return (
    <SetupJourneyScreen
      key={journeyId}
      journeyId={journeyId}
      onSwitchJourney={setJourneyOverride}
    />
  );
}

export default withPrivacyScope(SetupScreen);
