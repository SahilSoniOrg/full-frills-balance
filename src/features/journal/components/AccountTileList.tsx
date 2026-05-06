import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Opacity, Size, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/domain';
import { getAccountAccentColor } from '@/src/utils/accountCategory';
import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';

export interface AccountTileListProps {
  title?: string;
  accounts: Account[];
  selectedId: AccountId;
  onSelect: (id: AccountId) => void;
  onSearchRequest?: () => void;
}

export const AccountTileList = ({
  title,
  accounts,
  selectedId,
  onSelect,
  onSearchRequest,
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
      {/* Clickable header for opening the modal */}
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

          {onSearchRequest && (
            <TouchableOpacity
              onPress={onSearchRequest}
              activeOpacity={Opacity.medium}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.xs,
                paddingHorizontal: Spacing.sm,
                paddingVertical: Spacing.sm,
              }}
            >
              <AppIcon name="search" size={Size.iconXs} color={theme.primary} />
              <AppText variant="caption" weight="bold" color="primary">
                Browse all
              </AppText>
            </TouchableOpacity>
          )}
        </View>
      )}
      <View>
        <SelectionTileList
          items={items}
          selectedId={selectedId}
          onSelect={id => onSelect(id as AccountId)}
          testIDPrefix="account-option"
        />
      </View>
    </View>
  );
};
