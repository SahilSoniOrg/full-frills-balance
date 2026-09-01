import { AppButton, AppCard, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { importRegistry } from '@/src/services/import';
import { toast } from '@/src/utils/alerts';
import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { pickAndPrepareRestore } from './pickRestoreSource';
import type { RestoreSourceOutput } from './setupTypes';

export function RestoreSourceSlice({
  isCompleting,
  onContinue,
  onBack,
}: {
  readonly isCompleting: boolean;
  readonly onContinue: (output: RestoreSourceOutput) => void;
  readonly onBack: () => void;
}) {
  const plugins = useMemo(() => importRegistry.getAll(), []);
  const [progressMessage, setProgressMessage] = useState<string | undefined>();
  const preparing = progressMessage !== undefined || isCompleting;

  const onSelect = async (pluginId: string) => {
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
  };

  return (
    <Box flex={1} padding="lg">
      <ScrollView>
        <Stack gap="md">
          <AppText variant="title">Restore a backup</AppText>
          <AppText variant="body" color="secondary">
            Choose a format, then pick the backup file. Books are not published until the next step.
          </AppText>
          {plugins.map(plugin => (
            <AppCard key={plugin.id} elevation="sm" paddingSize="md">
              <Stack gap="sm">
                <AppText variant="subheading">{plugin.name}</AppText>
                <AppText variant="caption" color="secondary">
                  {plugin.description}
                </AppText>
                <AppButton
                  variant="primary"
                  testID={`restore-plugin-${plugin.id}`}
                  onPress={() => void onSelect(plugin.id)}
                  loading={preparing}
                  disabled={preparing}
                >
                  Select {plugin.name} file
                </AppButton>
              </Stack>
            </AppCard>
          ))}
          <AppButton variant="ghost" onPress={onBack} disabled={preparing}>
            Back
          </AppButton>
        </Stack>
      </ScrollView>
    </Box>
  );
}
