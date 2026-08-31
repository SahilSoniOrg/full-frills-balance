import { AppButton, AppText, LoadingView } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { PlainWorkplace } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { ScrollView, StyleSheet, View } from 'react-native';

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
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} testID="workplace-picker-screen">
        <AppText variant="heading">{copy.title}</AppText>
        <AppText variant="body" color="secondary">
          {copy.subtitle}
        </AppText>
        {transitionError && (
          <AppText variant="body" color="error" accessibilityRole="alert">
            {transitionError}
          </AppText>
        )}
        {isTransitioning && <LoadingView loading text={copy.opening} size="small" />}
        <View style={styles.options}>
          {workplaces.map(workplace => (
            <AppButton
              key={workplace.id}
              testID={`workplace-picker-option-${workplace.id}`}
              onPress={() => onSelect(workplace.id)}
              variant="secondary"
              disabled={isTransitioning}
              accessibilityLabel={copy.open(workplace.name)}
            >
              {workplace.name}
            </AppButton>
          ))}
        </View>
        <View style={styles.actions}>
          <AppButton
            testID="workplace-picker-create"
            onPress={onCreate}
            disabled={isTransitioning}
            accessibilityLabel={copy.create}
          >
            {copy.create}
          </AppButton>
          <AppButton
            testID="workplace-picker-import"
            onPress={onImport}
            variant="outline"
            disabled={isTransitioning}
            accessibilityLabel={copy.import}
          >
            {copy.import}
          </AppButton>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xxl,
  },
  options: { gap: Spacing.md, marginTop: Spacing.md },
  actions: { gap: Spacing.sm, marginTop: Spacing.xxl },
});
