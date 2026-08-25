import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalEntryHeaderProps {
  title: string;
  onClose: () => void;
  onOpenBatch?: () => void;
}

export const JournalEntryHeader = ({ title, onClose, onOpenBatch }: JournalEntryHeaderProps) => {
  const { theme, fonts } = useTheme();

  return (
    <View style={[styles.header, { backgroundColor: theme.background }]}>
      <TouchableOpacity
        onPress={onClose}
        style={styles.backButton}
        accessibilityLabel={AppConfig.strings.common.cancel}
        accessibilityRole="button"
      >
        <AppIcon name="close" size={Size.iconMd} color={theme.text} />
      </TouchableOpacity>

      <View style={styles.titleWrap}>
        <AppText
          variant="heading"
          style={[styles.headerTitle, { fontFamily: fonts.bold }]}
          numberOfLines={1}
        >
          {title}
        </AppText>
      </View>
      {onOpenBatch && (
        <TouchableOpacity
          style={[styles.batchButton, { borderColor: theme.border }]}
          onPress={onOpenBatch}
          accessibilityRole="button"
          accessibilityLabel="Open batch workspace"
        >
          <AppText variant="caption" color="secondary" weight="medium">
            Batch
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    padding: Spacing.sm,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  headerTitle: {
    textAlign: 'left',
    // dynamic font
  },
  batchButton: {
    minHeight: Size.buttonMd,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
