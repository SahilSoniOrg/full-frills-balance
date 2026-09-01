import { OnboardingScreen } from '@/src/features/onboarding';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import { generator } from '@/src/data/database/idGenerator';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppearanceSetupSlice } from './AppearanceSetupSlice';
import { DeviceSetupSlice } from './DeviceSetupSlice';
import { createSetupCoordinator, type SetupSliceOutputById } from './SetupCoordinator';
import { clearSetupDraft, loadSetupDraft } from './SetupDraftStore';
import { resolveSetupRoute } from './resolveSetupRoute';
import { finishSetup } from './setupFinishers';
import { SetupSummarySlice } from './SetupSummarySlice';
import type { SetupSliceId } from './setupTypes';
import type { WorkplaceId } from '@/src/types/ids';
import { WorkplaceSetupSlice } from './WorkplaceSetupSlice';

type RenderedSetupJourney = 'first_run' | 'create_workplace' | 'empty_device_workplace';

function SetupJourneyScreen({ journeyId }: { journeyId: RenderedSetupJourney }) {
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
        finish: async draft => {
          const workplaceId = await finishSetup(draft);
          if (!workplaceId) throw new Error('Workplace publication failed');
          return { kind: 'workplace_created', workplaceId };
        },
      }),
    [existingDraft, journeyId, operationId],
  );

  const [slice, setSlice] = useState<SetupSliceId>(() => {
    const action = coordinator.next();
    return action.kind === 'present'
      ? action.sliceId
      : action.kind === 'finish'
        ? 'summary'
        : journeyId === 'first_run'
          ? 'device'
          : 'workplace';
  });
  const [busy, setBusy] = useState(false);
  const draft = coordinator.getDraft();

  const advance = async <K extends SetupSliceId>(
    sliceId: K,
    output: SetupSliceOutputById[K],
  ): Promise<void> => {
    setBusy(true);
    try {
      await coordinator.accept(sliceId, output);
      const action = await coordinator.advanceAutoAccepted();
      if (action.kind !== 'present') {
        throw new Error(`Setup cannot present the next slice while action is ${action.kind}`);
      }
      setSlice(action.sliceId);
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
      const outcome = await coordinator.finish();
      if (outcome.kind === 'workplace_created') AppNavigation.toDashboard();
    } finally {
      setBusy(false);
    }
  };

  const goTo = (target: SetupSliceId) => {
    if (coordinator.getDraft().acceptedSlices.includes(target)) coordinator.edit(target);
    setSlice(target);
  };

  const goBack = () => {
    const result = coordinator.back();
    if (result.kind === 'at_start') {
      if (journeyId === 'create_workplace') AppNavigation.back();
      return;
    }
    setSlice(result.sliceId);
  };

  const startLegacyRestore = () => {
    // Restore still uses the proven post-import acknowledgement screen until its
    // dedicated Setup slices are wired. Do not leave a competing first-run draft.
    clearSetupDraft();
    AppNavigation.toImportSelection(false, 'onboarding');
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
            onRestore={startLegacyRestore}
          />
        );
      case 'workplace':
        return (
          <WorkplaceSetupSlice
            displayName={displayName}
            initial={draft.workplace}
            totalSteps={journeyId === 'first_run' ? 6 : 5}
            isCompleting={busy}
            onContinue={output => void advance('workplace', output)}
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
            onBack={() => goTo(journeyId === 'first_run' ? 'appearance' : 'workplace')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View testID="setup-screen" style={{ flex: 1 }}>
      {render()}
    </View>
  );
}

function SetupScreen() {
  const { mode, stage } = useLocalSearchParams<{ mode?: string; stage?: string }>();
  const route = resolveSetupRoute({
    mode,
    stage,
    hasPendingImportedWorkplace:
      preferences.device.onboardingStage === 'post_import' &&
      preferences.device.onboardingWorkplaceId !== undefined,
  });
  if (route === 'legacy_post_import') return <OnboardingScreen />;
  if (route === 'create_workplace') return <SetupJourneyScreen journeyId="create_workplace" />;
  const draft = loadSetupDraft();
  if (draft?.journeyId === 'first_run' || draft?.journeyId === 'empty_device_workplace') {
    return <SetupJourneyScreen journeyId={draft.journeyId} />;
  }
  return (
    <SetupJourneyScreen
      journeyId={preferences.device.deviceRegistered ? 'empty_device_workplace' : 'first_run'}
    />
  );
}

export default withPrivacyScope(SetupScreen);
