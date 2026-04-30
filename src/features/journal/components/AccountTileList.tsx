import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Opacity, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountAccentColor } from '@/src/utils/accountCategory';
import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';

export interface AccountTileListProps {
  title?: string;
  accounts: Account[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSearchRequest?: () => void;
  totalAccountsCount?: number;
}

export const AccountTileList = ({
  title,
  accounts,
  selectedId,
  onSelect,
  onSearchRequest,
  totalAccountsCount = 0,
}: AccountTileListProps) => {
  const { theme } = useTheme();

  const items = useMemo(() => {
    return accounts.map(account => ({
      id: account.id,
      label: account.name,
      icon: account.icon as IconName,
      color: getAccountAccentColor(account.accountType, theme),
    }));
  }, [accounts, theme]);

  return (
    <View style={{ gap: Spacing.xs, marginVertical: Spacing.sm }}>
      {/* Standard non-clickable header */}
      {title && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingRight: Spacing.xs,
            paddingVertical: Spacing.xs,
          }}
        >
          <AppText
            variant="caption"
            weight="bold"
            color="tertiary"
            style={{ marginLeft: Spacing.xs }}
          >
            {title}
          </AppText>
        </View>
      )}
      <View>
        <SelectionTileList
          items={items}
          selectedId={selectedId}
          onSelect={id => onSelect(id)}
          testIDPrefix="account-option"
        />
      </View>

      {/* Clear, distinct interaction for opening the modal */}
      {onSearchRequest && totalAccountsCount > accounts.length && (
        <TouchableOpacity
          onPress={onSearchRequest}
          activeOpacity={Opacity.medium}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: Spacing.sm,
            marginTop: Spacing.xs,
            gap: Spacing.xs,
          }}
        >
          <AppIcon name="search" size={14} color={theme.textTertiary} />
          <AppText variant="caption" weight="semibold" color="tertiary">
            Browse all accounts...
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );
};
