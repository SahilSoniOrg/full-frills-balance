import { AppButton, AppCard, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing, Typography } from '@/src/constants';
import type { ImportPlugin } from '@/src/services/import/types';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SettingsMaintenanceOverlay } from '@/src/features/settings/components/SettingsMaintenanceOverlay';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { useTheme } from '@/src/hooks/use-theme';

interface ImportPluginCardProps {
  plugin: ImportPlugin;
  index: number;
  isImporting: boolean;
  onSelect: (id: string) => void;
}

const ImportPluginCard = ({ plugin, index, isImporting, onSelect }: ImportPluginCardProps) => {
  const { theme } = useTheme();
  const handleSelect = useCallback(() => {
    onSelect(plugin.id);
  }, [onSelect, plugin.id]);

  return (
    <AppCard key={plugin.id} elevation="sm" padding="md" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.iconPlaceholder, { backgroundColor: theme.surfaceSecondary }]}>
          <AppText variant="heading" style={{ fontSize: Typography.sizes.xxl }}>
            {plugin.icon}
          </AppText>
        </View>
        <View style={styles.textCol}>
          <AppText variant="subheading">{plugin.name}</AppText>
          <AppText variant="caption" color="secondary" style={styles.desc}>
            {plugin.description}
          </AppText>
        </View>
      </View>
      <AppButton
        variant={index === 0 ? 'primary' : 'outline'}
        onPress={handleSelect}
        loading={isImporting}
        style={styles.button}
      >
        {AppConfig.strings.settings.selectFile(plugin.name.split(' ')[0])}
      </AppButton>
    </AppCard>
  );
};

interface ImportSelectionViewProps {
  plugins: ImportPlugin[];
  isImporting: boolean;
  progress: number;
  progressMessage?: string;
  onSelect: (id: string) => void;
}

export function ImportSelectionView({
  plugins,
  isImporting,
  progress,
  progressMessage,
  onSelect,
}: ImportSelectionViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.importTitle}>
      <View style={styles.container}>
        <AppText variant="body" style={styles.intro}>
          {AppConfig.strings.settings.importIntro}
        </AppText>

        {plugins.map((plugin, index) => (
          <ImportPluginCard
            key={plugin.id}
            plugin={plugin}
            index={index}
            onSelect={onSelect}
            isImporting={isImporting}
          />
        ))}

        <View style={styles.note}>
          <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            {AppConfig.strings.settings.importNote}
          </AppText>
        </View>
      </View>

      <SettingsMaintenanceOverlay
        isVisible={isImporting}
        title="Importing Data"
        progress={progress}
        progressMessage={progressMessage || 'Restoring Backup...'}
        hint="This may take a few minutes for large backups. Please do not close the app."
        icon="refresh"
      />
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  intro: {
    marginBottom: Spacing.sm,
  },
  card: {
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  iconPlaceholder: {
    width: Size.xxl,
    height: Size.xxl,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  textCol: {
    flex: 1,
  },
  desc: {
    marginTop: Spacing.xs,
    lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
  },
  button: {
    width: '100%',
  },
  note: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
});
