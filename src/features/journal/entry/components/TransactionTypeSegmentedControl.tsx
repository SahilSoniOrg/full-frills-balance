import { AppConfig } from '@/src/constants';
import { AppSegmentedControl, Icon, type SegmentedOption } from '@/src/components/core';
import { Opacity, Size, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import type { TabType } from '@/src/types/domainJournal';
import { withOpacity } from '@/src/utils/color-math';
import { resolveSimpleTypeAccentColor } from '../journalEntryPresentation';
import { StyleSheet, View } from 'react-native';

export interface TransactionTypeSegmentedControlProps {
  value: TabType;
  onChange: (value: TabType) => void;
  accentColor: string;
  variant: 'standard' | 'compact';
}

const TRANSACTION_TYPE_OPTIONS: readonly SegmentedOption<TabType>[] = [
  { id: 'expense', label: AppConfig.strings.journal.expense, icon: Icon.ArrowDown },
  { id: 'income', label: AppConfig.strings.journal.income, icon: Icon.ArrowUp },
  { id: 'transfer', label: AppConfig.strings.journal.transfer, icon: Icon.SwapHorizontal },
];

export function TransactionTypeSegmentedControl({
  value,
  onChange,
  accentColor,
  variant,
}: TransactionTypeSegmentedControlProps) {
  const { theme } = useTheme();
  const isCompact = variant === 'compact';
  const options = isCompact
    ? TRANSACTION_TYPE_OPTIONS.map(option => ({
        ...option,
        color: resolveSimpleTypeAccentColor(option.id, theme),
      }))
    : TRANSACTION_TYPE_OPTIONS;

  return (
    <View style={isCompact ? styles.compactTypeSwitcher : styles.standardTypeSwitcher}>
      <AppSegmentedControl<TabType>
        options={options}
        value={value}
        onChange={onChange}
        iconOnly={isCompact}
        flex
        size="md"
        itemHeight={isCompact ? 38 : undefined}
        trackColor={
          isCompact ? withOpacity(accentColor, Opacity.selection) : theme.surfaceSecondary
        }
        pillColor={isCompact ? withOpacity(accentColor, Opacity.soft) : theme.surface}
        activeTextColor={accentColor}
        inactiveTextColor={
          isCompact ? withOpacity(accentColor, Opacity.heavy) : theme.textSecondary
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  standardTypeSwitcher: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  compactTypeSwitcher: {
    width: Size.typeIconWidth,
    height: Size.controlCompact,
  },
});
