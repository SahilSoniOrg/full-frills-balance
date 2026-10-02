import { useTheme } from '@/src/hooks/use-theme';
import { AppIcon, AppText } from '@/src/components/core';
import { AccountCategoryPill } from '@/src/components/accounts/AccountCategoryPill';
import { ArchivedAccountIndicator } from '@/src/components/accounts/ArchivedAccountIndicator';
import { useAccountColors } from '@/src/hooks/useAccountColors';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { Size, Spacing } from '@/src/constants';
import { getAccountIcon } from '@/src/utils/accountIcon';
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
  textColor,
  colors,
}: AccountInlineLabelProps) {
  const { theme } = useTheme();
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
  const accentColor = colors?.accentColor ?? fallbackColors.accentColor;
  const archived = isAccountArchived(account);

  return (
    <View style={styles.row}>
      {showIcon ? (
        <AppIcon name={getAccountIcon(account)} size={Size.iconXs} color={accentColor} />
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
});
