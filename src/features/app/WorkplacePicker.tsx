import {
  Icon,
  AppIcon,
  AppText,
  IconTile,
  ListGroup,
  ListRow,
  LoadingView,
  parseIconName,
  type IconName,
} from '@/src/components/core';
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
  const tile = (icon: IconName) => (
    <IconTile icon={icon} tint={isTransitioning ? 'textSecondary' : 'primary'} />
  );

  return (
    <Page
      background="background"
      scrollable
      edges={['top', 'bottom']}
      scrollViewProps={{
        contentContainerStyle: styles.content,
        testID: 'workplace-picker-screen',
      }}
    >
      <View style={styles.intro}>
        <View style={[styles.icon, { backgroundColor: theme.surfaceSecondary }]}>
          <AppIcon name={Icon.Briefcase} size={28} color={theme.primary} />
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
          <AppIcon name={Icon.Alert} size={20} color={theme.error} />
          <AppText variant="caption" color="error" accessibilityRole="alert">
            {transitionError}
          </AppText>
        </View>
      )}
      {isTransitioning && <LoadingView loading text={copy.opening} size="small" />}
      {workplaces.length > 0 && (
        <ListGroup
          variant="plain"
          header={copy.available}
          items={workplaces}
          rowProps={{ subtitle: copy.openThis, disabled: isTransitioning }}
          toRow={workplace => ({
            id: workplace.id,
            leading: tile(parseIconName(workplace.icon, Icon.Briefcase)),
            title: workplace.name,
            onPress: () => onSelect(workplace.id),
            testID: `workplace-picker-option-${workplace.id}`,
          })}
        />
      )}
      <View style={styles.startAnother}>
        <ListGroup variant="plain" header={copy.startAnother}>
          <ListRow
            leading={tile(Icon.Plus)}
            title={copy.create}
            subtitle={copy.createSubtitle}
            onPress={onCreate}
            disabled={isTransitioning}
            testID="workplace-picker-create"
          />
          <ListRow
            leading={tile(Icon.FolderOpen)}
            title={copy.import}
            subtitle={copy.importSubtitle}
            onPress={onImport}
            disabled={isTransitioning}
            testID="workplace-picker-import"
          />
        </ListGroup>
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
