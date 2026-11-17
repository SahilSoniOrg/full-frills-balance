import { AccountInlineLabel } from '@/src/components/accounts/AccountInlineLabel';
import type { AccountDisplay } from '@/src/types/plainDtos';

/**
 * Account name with its colour and icon, so a suggestion row makes it obvious
 * which account the category or name default applies to.
 *
 * AccountInlineLabel already renders the accent colour, icon, archived badge and
 * the missing-account fallback; this only pins the variant and fallback copy so
 * every suggestion surface reads the same.
 */
export function SuggestionAccountLabel({
  account,
  name,
  placeholder,
  variant = 'caption',
}: {
  account?: AccountDisplay;
  name?: string;
  placeholder: string;
  variant?: 'body' | 'caption';
}) {
  return (
    <AccountInlineLabel
      account={account}
      placeholder={name ?? placeholder}
      variant={variant}
      weight="medium"
      numberOfLines={1}
      showIcon
    />
  );
}
