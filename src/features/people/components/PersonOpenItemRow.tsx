import { Icon, IconTile, ListRow } from '@/src/components/core';
import { OpenItemAmount } from '@/src/components/shared/OpenItemAmount';
import { Shape, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityRole, type AccessibilityState } from 'react-native';

type Props = {
  remainder: number;
  originalAmount: number;
  currencyCode: string;
  isPrivacyMode: boolean;
  /** Settled fraction progress bar under the amounts. */
  showProgress?: boolean;
  selected?: boolean;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  testID?: string;
};

/** Shared open-item ListRow: remainder/original, optional progress, optional selection trailing. */
export function PersonOpenItemRow({
  remainder,
  originalAmount,
  currencyCode,
  isPrivacyMode,
  showProgress = false,
  selected = false,
  trailing,
  chevron,
  onPress,
  accessibilityRole,
  accessibilityState,
  testID,
}: Props) {
  const { theme } = useTheme();
  const settledRatio =
    showProgress && originalAmount > 0
      ? Math.max(0, Math.min(100, (1 - remainder / originalAmount) * 100))
      : 0;

  return (
    <ListRow
      leading={<IconTile icon={Icon.Receipt} tint={selected ? 'income' : 'warning'} />}
      title={
        <OpenItemAmount
          remainder={remainder}
          originalAmount={originalAmount}
          currencyCode={currencyCode}
          isPrivacyMode={isPrivacyMode}
        />
      }
      trailing={trailing}
      chevron={chevron}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      testID={testID}
    >
      {settledRatio > 0 ? (
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${settledRatio}%`,
                backgroundColor: theme.income,
              },
            ]}
          />
        </View>
      ) : null}
    </ListRow>
  );
}

const styles = StyleSheet.create({
  progressTrack: {
    height: Spacing.xs,
    borderRadius: Shape.radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: Spacing.xs,
  },
});
