import { useTheme } from '@/src/hooks/use-theme';
import { AppIcon, AppText } from '@/src/components/core';
import { AccountCategoryPill } from '@/src/components/accounts/AccountCategoryPill';
import { ArchivedAccountIndicator } from '@/src/components/accounts/ArchivedAccountIndicator';
import { useAccountColors } from '@/src/hooks/useAccountColors';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { Shape, Size, Spacing } from '@/src/constants';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { getAccountTypeVariant, resolveAccountAppearance } from '@/src/utils/accountCategory';
import { StyleSheet, View } from 'react-native';

type TextVariant = 'body' | 'caption' | 'subheading';
type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

interface AccountInlineLabelProps {
  account?: {
    name: string;
    accountType: string;
    color?: string | null;
    icon?: string | null;
    archivedAt?: Date | number | null;
  } | null;
  placeholder?: string;
  variant?: TextVariant;
  weight?: TextWeight;
  numberOfLines?: number;
  /** Size of the category pill. */
  pillSize?: 'sm' | 'md';
  /** Display the account's icon instead of the category marker. */
  showIcon?: boolean;
  /** Match the tinted, single-line account segment used in transaction flows. */
  appearance?: 'inline' | 'transactionFlow';
  /** Override the text color (defaults to the account accent color). */
  textColor?: string;
  /** Optional pre-resolved colors to avoid re-computing hook values. */
  colors?: {
    accentColor: string;
    categoryColor: string;
  };
}

/**
 * Compact inline display of an account: [CategoryPill] [ArchivedBadge?] [Name].
 * Resolves accent and category colors internally so callers don't need to.
 */
export function AccountInlineLabel({
  account,
  placeholder,
  variant = 'body',
  weight = 'medium',
  numberOfLines = 1,
  pillSize = 'md',
  showIcon = false,
  appearance = 'inline',
  textColor,
  colors,
}: AccountInlineLabelProps) {
  const { theme, getVariantColors } = useTheme();
  const fallbackColors = useAccountColors(account ?? { accountType: '' });

  if (!account) {
    return (
      <AppText
        variant={variant}
        weight={weight}
        numberOfLines={numberOfLines}
        style={{ color: textColor ?? theme.textTertiary, flexShrink: 1 }}
      >
        {placeholder ?? ''}
      </AppText>
    );
  }

  const categoryColor = colors?.categoryColor ?? fallbackColors.categoryColor;
  const flowBackground =
    appearance === 'transactionFlow'
      ? getVariantColors(getAccountTypeVariant(account.accountType)).light
      : undefined;
  const flowColors = flowBackground
    ? resolveAccountAppearance(account, theme, flowBackground)
    : undefined;
  const accentColor =
    textColor ?? flowColors?.accentColor ?? colors?.accentColor ?? fallbackColors.accentColor;
  const archived = isAccountArchived(account);

  return (
    <View
      testID={appearance === 'transactionFlow' ? 'account-flow-label' : undefined}
      style={[
        styles.row,
        appearance === 'transactionFlow' && [styles.flowLabel, { backgroundColor: flowBackground }],
      ]}
    >
      {showIcon ? (
        <AppIcon
          name={getAccountIcon(account)}
          size={Size.xxs}
          color={
            appearance === 'transactionFlow'
              ? (flowColors?.categoryColor ?? categoryColor)
              : accentColor
          }
        />
      ) : (
        <AccountCategoryPill color={categoryColor} size={pillSize} />
      )}
      {archived ? <ArchivedAccountIndicator emphasized /> : null}
      <AppText
        variant={variant}
        weight={weight}
        numberOfLines={numberOfLines}
        style={{ color: textColor ?? accentColor, flexShrink: 1 }}
      >
        {account.name}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 1,
    minWidth: 0,
  },
  flowLabel: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Shape.radius.md,
    borderCurve: 'continuous',
  },
});
