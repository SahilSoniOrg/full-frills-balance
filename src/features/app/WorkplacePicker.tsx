import { AppIcon, AppText, LoadingView } from '@/src/components/core';
import { SettingsMenu } from '@/src/components/settings/SettingsMenu';
import { SettingsMenuItem } from '@/src/components/settings/SettingsMenuItem';
import { AppConfig } from '@/src/constants/app-config';
import { Spacing } from '@/src/constants/design-tokens';
import { Page } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { PlainWorkplace } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { StyleSheet, View } from 'react-native';

export function WorkplacePicker({
  workplaces,
  transitionError,
  onSelect,
  onCreate,
  onImport,
  isTransitioning,
}: {
  workplaces: PlainWorkplace[];
  transitionError: string | null;
  onSelect: (id: WorkplaceId) => void;
  onCreate: () => void;
  onImport: () => void;
  isTransitioning: boolean;
}) {
  const copy = AppConfig.strings.settings.workplacePicker;
  const { theme } = useTheme();

  return (
    <Page
      background="background"
      scrollable
      edges={['top', 'bottom']}
      scrollViewProps={{ contentContainerStyle: styles.content, testID: 'workplace-picker-screen' }}
    >
      <View style={styles.intro}>
        <View style={[styles.icon, { backgroundColor: theme.surfaceSecondary }]}>
          <AppIcon name="briefcase" size={28} color={theme.primary} />
        </View>
        <View style={styles.introCopy}>
          <AppText variant="heading">{copy.title}</AppText>
          <AppText variant="body" color="secondary">
            {copy.subtitle}
          </AppText>
        </View>
      </View>
      {transitionError && (
        <View style={[styles.error, { backgroundColor: theme.errorLight }]}>
          <AppIcon name="alert" size={20} color={theme.error} />
          <AppText variant="caption" color="error" accessibilityRole="alert">
            {transitionError}
          </AppText>
        </View>
      )}
      {isTransitioning && <LoadingView loading text={copy.opening} size="small" />}
      {workplaces.length > 0 && (
        <SettingsMenu header="Available Workplaces">
          {workplaces.map(workplace => (
            <SettingsMenuItem
              key={workplace.id}
              leftIcon="briefcase"
              title={workplace.name}
              description="Open this workplace"
              onPress={() => onSelect(workplace.id)}
              disabled={isTransitioning}
              testID={`workplace-picker-option-${workplace.id}`}
            />
          ))}
        </SettingsMenu>
      )}
      <View style={styles.startAnother}>
        <SettingsMenu header="Start another">
          <SettingsMenuItem
            leftIcon="plus"
            title={copy.create}
            description="Set up a new set of books"
            onPress={onCreate}
            disabled={isTransitioning}
            testID="workplace-picker-create"
          />
          <SettingsMenuItem
            leftIcon="folderOpen"
            title={copy.import}
            description="Restore books from a backup"
            onPress={onImport}
            disabled={isTransitioning}
            testID="workplace-picker-import"
          />
        </SettingsMenu>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  introCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  startAnother: {
    marginTop: Spacing.sm,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 12,
  },
});
