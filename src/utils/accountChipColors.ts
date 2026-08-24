import { Theme } from '@/src/constants/design-tokens';
import { AccountType } from '@/src/types/enums';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { withOpacity } from '@/src/utils/color-math';

export interface AccountChipColors {
  text: string;
  icon: string;
  marker: string;
  bg: string;
  border: string;
}

/**
 * Derives the chip/pill color set for an account selector.
 * Returns neutral placeholder colors when no account is provided.
 */
export function resolveAccountChipColors(
  account: { accountType: string | AccountType; color?: string | null } | undefined,
  theme: Theme,
): AccountChipColors {
  if (!account) {
    return {
      text: theme.textTertiary,
      icon: theme.textTertiary,
      marker: theme.border,
      bg: 'transparent',
      border: theme.border,
    };
  }

  const { accentColor, categoryColor } = resolveAccountAppearance(account, theme);

  return {
    text: accentColor,
    icon: accentColor,
    marker: categoryColor,
    bg: withOpacity(accentColor, 0.12),
    border: accentColor,
  };
}
