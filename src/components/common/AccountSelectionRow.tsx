import { AppText, ListRow } from '@/src/components/core';
import Account from '@/src/data/models/Account';
import { Box } from '@/src/design-system/Box';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountTypeColorKey } from '@/src/utils/accountCategory';
import { withOpacity } from '@/src/utils/color-math';
import React, { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

type AccountSelectionRowProps = {
  title: string;
  accounts: Account[];
  selectedAccountId?: string;
  selectedAccountIds?: string[];
  placeholder: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function AccountSelectionRow({
  title,
  accounts,
  selectedAccountId,
  selectedAccountIds,
  placeholder,
  onPress,
  style,
}: AccountSelectionRowProps) {
  const { theme } = useTheme();

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach(acc => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  const subtitle = useMemo(() => {
    // Handle Multiple Selection
    if (selectedAccountIds && selectedAccountIds.length > 0) {
      const selectedAccounts = selectedAccountIds
        .map(id => accountMap.get(id))
        .filter((acc): acc is Account => !!acc);

      if (selectedAccounts.length === 0) return placeholder;
      if (selectedAccounts.length === 1) {
        const acc = selectedAccounts[0];
        const colorKey = getAccountTypeColorKey(acc.accountType);
        const color = theme[colorKey] || theme.text;
        return (
          <AppText variant="body" weight="medium" style={{ color }}>
            {acc.name}
          </AppText>
        );
      }

      return (
        <Box flexDirection="row" flexWrap="wrap" gap="xs" marginTop="xs">
          {selectedAccounts.map(acc => {
            const colorKey = getAccountTypeColorKey(acc.accountType);
            const color = theme[colorKey] || theme.text;
            return (
              <Box
                key={acc.id}
                style={{
                  backgroundColor: withOpacity(color as string, 0.1),
                  borderColor: withOpacity(color as string, 0.2),
                }}
                paddingHorizontal="sm"
                paddingVertical={2}
                borderRadius="r2"
                borderWidth={1}
              >
                <AppText variant="caption" style={{ color }}>
                  {acc.name}
                </AppText>
              </Box>
            );
          })}
        </Box>
      );
    }

    // Handle Single Selection
    if (selectedAccountId) {
      const acc = accountMap.get(selectedAccountId);
      if (acc) {
        const colorKey = getAccountTypeColorKey(acc.accountType);
        const color = theme[colorKey] || theme.text;
        return (
          <AppText variant="body" weight="medium" style={{ color }}>
            {acc.name}
          </AppText>
        );
      }
    }

    return placeholder;
  }, [accountMap, placeholder, selectedAccountId, selectedAccountIds, theme]);

  return <ListRow title={title} subtitle={subtitle} onPress={onPress} style={style} />;
}
