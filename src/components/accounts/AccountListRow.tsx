import { getArchivedAccountPickerRowPresentation } from '@/src/components/accounts/archivedAccountDisplay';
import { ArchivedAccountIndicator } from '@/src/components/accounts/ArchivedAccountIndicator';
import { SelectionCheckmark, SelectionIndicator } from '@/src/components/shared/SelectionIndicator';
import { AppIcon, AppText, Icon, ListRow } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import {
  getAccountTypeVariant,
  resolveAccountAppearance,
} from '@/src/design-system/accountPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields, PlainAccount } from '@/src/types/plainDtos';
import { isAccountArchived } from '@/src/domain/accounts/accountArchive';
import { getAccountIcon } from '@/src/utils/accountIcon';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export type AccountListRowProps = {
  item: AccountFields | PlainAccount;
  isSelected?: boolean;
  isMultiple?: boolean;
  isPinnedArchived?: boolean;
  onPress?: (id: AccountId) => void;
  trailingAccessory?: ReactNode;
  testID?: string;
};

/** Shared account row for account selection and account summaries. */
export function AccountListRow({
  item,
  isSelected = false,
  isMultiple = false,
  isPinnedArchived = false,
  onPress,
  trailingAccessory,
  testID,
}: AccountListRowProps) {
  const { theme } = useTheme();
  const archived = isAccountArchived(item);
  const subtitle = [item.accountType, item.currencyCode].filter(Boolean).join(' • ');
  const { accentColor } = resolveAccountAppearance(item, theme);
  const { opacity, emphasizeIndicator } = getArchivedAccountPickerRowPresentation(
    archived,
    isPinnedArchived,
  );
  const trailing =
    archived || trailingAccessory || onPress ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        {archived ? <ArchivedAccountIndicator emphasized={emphasizeIndicator} /> : null}
        {trailingAccessory}
        {onPress ? (
          isMultiple ? (
            <SelectionIndicator selected={isSelected} />
          ) : (
            <SelectionCheckmark selected={isSelected} size={Size.iconMd} />
          )
        ) : null}
      </View>
    ) : undefined;

  return (
    <ListRow
      title={
        <AppText variant="body" color={getAccountTypeVariant(item.accountType)} numberOfLines={1}>
          {item.name}
        </AppText>
      }
      accessibilityLabel={item.name}
      accessibilityRole={onPress ? (isMultiple ? 'checkbox' : 'button') : undefined}
      accessibilityState={
        onPress ? (isMultiple ? { checked: isSelected } : { selected: isSelected }) : undefined
      }
      testID={testID ?? `account-picker-option-${item.id}`}
      subtitle={subtitle}
      onPress={onPress ? () => onPress(item.id) : undefined}
      background={isSelected ? 'surfaceSecondary' : 'transparent'}
      style={{ opacity }}
      leading={
        <AppIcon
          name={getAccountIcon(item)}
          size={Size.iconMd}
          color={accentColor}
          fallbackIcon={Icon.Wallet}
        />
      }
      trailing={trailing}
    />
  );
}
