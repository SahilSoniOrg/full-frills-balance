import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { ImportPluginCard } from '@/src/components/common/ImportPluginCard';
import { Box } from '@/src/design-system';
import { importRegistry } from '@/src/services/import';
import { toast } from '@/src/utils/alerts';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { pickAndPrepareRestore } from './pickRestoreSource';
import type { RestoreSourceOutput } from './setupTypes';

export function RestoreSourceSlice({
  isCompleting,
  onContinue,
}: {
  readonly isCompleting: boolean;
  readonly onContinue: (output: RestoreSourceOutput) => void;
}) {
  const plugins = useMemo(() => importRegistry.getAll(), []);
  const [progressMessage, setProgressMessage] = useState<string | undefined>();
  const preparing = progressMessage !== undefined || isCompleting;

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
        onContinue(result);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not prepare the selected backup.',
        );
      } finally {
        setProgressMessage(undefined);
      }
    },
    [onContinue],
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
