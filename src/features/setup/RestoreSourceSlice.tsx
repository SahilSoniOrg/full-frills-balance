import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { ImportPluginCard } from '@/src/components/settings/ImportPluginCard';
import { Box } from '@/src/design-system';
import { importRegistry } from '@/src/services/import';
import { toast } from '@/src/utils/alerts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { pickAndPrepareRestore } from './pickRestoreSource';
import type { V2Backup } from './pickRestoreSource';
import { V2RestoreSelectionSheet } from './V2RestoreSelectionSheet';
import type { RestoreSourceOutput } from './setupTypes';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';

type WorkplaceEntry = NonNullable<V2Backup['workplaces']>[number];

export function RestoreSourceSlice({
  isCompleting,
  onContinue,
}: {
  readonly isCompleting: boolean;
  readonly onContinue: (output: RestoreSourceOutput) => void;
}) {
  const plugins = useMemo(() => importRegistry.getAll(), []);
  const [progressMessage, setProgressMessage] = useState<string | undefined>();
  const [selection, setSelection] = useState<{
    workplaces: WorkplaceEntry[];
    selectedIndexes: number[];
  }>();
  const selectionResolver = useRef<((indexes: number[]) => void) | undefined>(undefined);
  const preparing = progressMessage !== undefined || isCompleting;

  const selectV2Workplaces = useCallback((workplaces: WorkplaceEntry[]) => {
    return new Promise<number[]>(resolve => {
      selectionResolver.current = resolve;
      setSelection({
        workplaces,
        selectedIndexes: workplaces.map((_, index) => index),
      });
    });
  }, []);

  useEffect(() => {
    if (readE2eLaunchConfig()?.seedProfile !== 'bulk-restore-selection') return;
    void selectV2Workplaces([
      { workplace: { name: 'Personal', icon: 'briefcase', defaultCurrencyCode: 'USD' }, data: {} },
      { workplace: { name: 'Freelance', icon: 'briefcase', defaultCurrencyCode: 'EUR' }, data: {} },
      {
        workplace: { name: 'Side project', icon: 'briefcase', defaultCurrencyCode: 'GBP' },
        data: {},
      },
    ]);
  }, [selectV2Workplaces]);

  const onSelect = useCallback(
    async (pluginId: string) => {
      setProgressMessage('Preparing restore source...');
      try {
        const result = await pickAndPrepareRestore(
          pluginId,
          (message, progress) => {
            setProgressMessage(
              progress === undefined ? message : `${message} ${Math.round(progress * 100)}%`,
            );
          },
          selectV2Workplaces,
        );
        if (result === 'cancelled') return;
        onContinue(result);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not prepare the selected backup.',
        );
      } finally {
        setProgressMessage(undefined);
      }
    },
    [onContinue, selectV2Workplaces],
  );

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
        <V2RestoreSelectionSheet
          visible
          workplaces={selection.workplaces}
          selectedIndexes={selection.selectedIndexes}
          onChange={selectedIndexes =>
            setSelection(current => current && { ...current, selectedIndexes })
          }
          onClose={() => {
            selectionResolver.current?.([]);
            selectionResolver.current = undefined;
            setSelection(undefined);
          }}
          onConfirm={() => {
            selectionResolver.current?.(selection.selectedIndexes);
            selectionResolver.current = undefined;
            setSelection(undefined);
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
