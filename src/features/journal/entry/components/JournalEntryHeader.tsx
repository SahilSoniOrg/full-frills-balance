import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalEntryHeaderProps {
  title: string;
  onClose?: () => void;
}

export const JournalEntryHeader = ({ title, onClose }: JournalEntryHeaderProps) => {
  const { theme, fonts } = useTheme();

  const handleClose = onClose || (() => AppNavigation.back());

  return (
    <View style={[styles.header, { backgroundColor: theme.background }]}>
      <TouchableOpacity
        onPress={handleClose}
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
});
