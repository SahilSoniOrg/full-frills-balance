import { AppText } from '@/src/components/core';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { AppConfig, Spacing } from '@/src/constants';
import { ImportPluginCard } from '@/src/components/settings/ImportPluginCard';
import { Box } from '@/src/design-system';
import { importRegistry } from '@/src/services/import';
import { toast } from '@/src/services/feedback/alerts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  forgetAllPreparedRestores,
  keepPreparedRestores,
  pickAndPrepareRestore,
  selectPreparedRestoreSources,
} from './pickRestoreSource';
import {
  RestoreWorkplaceSelectionSheet,
  type RestoreWorkplaceCandidate,
} from './RestoreWorkplaceSelectionSheet';
import type { RestoreSourceOutput } from './setupTypes';
import {
  e2ePrepareRestoreSelection,
  e2eRestoreSelectionSources,
} from '@/src/testing/fixtures/restoreSelectionE2e';

type PendingRestoreSelection = {
  readonly sources: readonly RestoreSourceOutput[];
  readonly workplaces: readonly RestoreWorkplaceCandidate[];
  readonly selectedIndexes: readonly number[];
};

function restoreCandidates(
  sources: readonly RestoreSourceOutput[],
): readonly RestoreWorkplaceCandidate[] {
  return sources.map((source, index) => ({
    name: source.facts.workplace.name ?? `Workplace ${index + 1}`,
    currency: source.facts.workplace.defaultCurrencyCode ?? '',
    accounts: source.stats?.accounts,
    categories: source.stats?.categories,
    journals: source.stats?.journals,
  }));
}

function pendingSelection(sources: readonly RestoreSourceOutput[]): PendingRestoreSelection {
  const workplaces = restoreCandidates(sources);
  return {
    sources,
    workplaces,
    selectedIndexes: workplaces.map((_, index) => index),
  };
}

export function RestoreSourceSlice({
  isCompleting,
  onContinue,
}: {
  readonly isCompleting: boolean;
  readonly onContinue: (sources: readonly RestoreSourceOutput[]) => void;
}) {
  const plugins = useMemo(() => importRegistry.getAll(), []);
  const [progressMessage, setProgressMessage] = useState<string | undefined>();
  const [sheetState, setSheetState] = useState<{
    visible: boolean;
    selection: PendingRestoreSelection | undefined;
  }>(() => {
    const sources = e2eRestoreSelectionSources();
    return {
      visible: Boolean(sources),
      selection: sources ? pendingSelection(sources) : undefined,
    };
  });
  const afterSelectionDismiss = useAfterDismiss();
  const selection = sheetState.selection;
  const preparing = progressMessage !== undefined || isCompleting;

  const presentSelection = useCallback(
    (sources: readonly RestoreSourceOutput[]) => {
      afterSelectionDismiss.cancel();
      setSheetState({ visible: true, selection: pendingSelection(sources) });
    },
    [afterSelectionDismiss],
  );

  const onSelect = useCallback(
    async (pluginId: string) => {
      setProgressMessage('Preparing restore source...');
      try {
        const result = await pickAndPrepareRestore(pluginId, (message, progress) => {
          setProgressMessage(
            progress === undefined ? message : `${message} ${Math.round(progress * 100)}%`,
          );
        });
        if (result === 'cancelled') return;
        presentSelection(result);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not prepare the selected backup.',
        );
      } finally {
        setProgressMessage(undefined);
      }
    },
    [presentSelection],
  );

  useEffect(() => {
    const prepare = e2ePrepareRestoreSelection();
    if (!prepare) return;
    let cancelled = false;
    void prepare
      .then(sources => {
        if (!cancelled) presentSelection(sources);
      })
      .catch(error => {
        if (cancelled) return;
        toast.error(
          error instanceof Error ? error.message : 'Could not prepare the selected backup.',
        );
      })
      .finally(() => {
        if (!cancelled) setProgressMessage(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [presentSelection]);

  return (
    <Box flex={1} testID="restore-source-slice">
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Box padding="lg">
          <AppText variant="title">{AppConfig.strings.settings.importTitle}</AppText>
          <AppText variant="body" style={styles.intro}>
            {AppConfig.strings.settings.importIntro}
          </AppText>

          {plugins.map((plugin, index) => (
            <ImportPluginCard
              key={plugin.id}
              plugin={plugin}
              index={index}
              isBusy={preparing}
              onSelect={onSelect}
              testIDPrefix="restore-plugin"
            />
          ))}

          <View style={styles.note}>
            <AppText variant="caption" color="secondary" style={styles.noteText}>
              {AppConfig.strings.settings.importNote}
            </AppText>
          </View>
        </Box>
      </ScrollView>
      {selection && (
        <RestoreWorkplaceSelectionSheet
          visible={sheetState.visible}
          workplaces={selection.workplaces}
          selectedIndexes={selection.selectedIndexes}
          onChange={selectedIndexes =>
            setSheetState(current =>
              current.selection
                ? { ...current, selection: { ...current.selection, selectedIndexes } }
                : current,
            )
          }
          onClose={() => {
            afterSelectionDismiss.run(() => forgetAllPreparedRestores());
            setSheetState(current => ({ ...current, visible: false }));
          }}
          onDismiss={() => {
            afterSelectionDismiss.onDismiss();
            setSheetState(current =>
              current.visible ? current : { visible: false, selection: undefined },
            );
          }}
          onConfirm={() => {
            const sources = selectPreparedRestoreSources(
              selection.sources,
              selection.selectedIndexes,
            );
            if (!sources) {
              afterSelectionDismiss.run(() => forgetAllPreparedRestores());
              setSheetState(current => ({ ...current, visible: false }));
              return;
            }
            keepPreparedRestores(sources);
            afterSelectionDismiss.run(() => onContinue(sources));
            setSheetState(current => ({ ...current, visible: false }));
          }}
        />
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.xl },
  intro: { marginBottom: Spacing.md },
  note: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  noteText: { textAlign: 'center' },
});
