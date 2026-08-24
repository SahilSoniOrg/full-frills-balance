import { ListRow } from '@/src/components/core';
import { AccountInlineLabel } from '@/src/components/common/AccountInlineLabel';
import type { AccountFields } from '@/src/types/plainDtos';
import { Box } from '@/src/design-system/Box';
import { useTheme } from '@/src/hooks/use-theme';
import { resolveAccountChipColors } from '@/src/utils/accountChipColors';
import { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

type AccountSelectionRowProps = {
  title: string;
  accounts: AccountFields[];
  selectedAccountId?: string;
  selectedAccountIds?: string[];
  placeholder: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function AccountSelectionRow({
  title,
  accounts,
  selectedAccountId,
  selectedAccountIds,
  placeholder,
  onPress,
  style,
  testID,
}: AccountSelectionRowProps) {
  const { theme } = useTheme();

  const accountMap = useMemo(() => {
    const map = new Map<string, AccountFields>();
    accounts.forEach(acc => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  const subtitle = useMemo(() => {
    // Resolve selected accounts — either from multi or single selection
    const resolvedAccounts: AccountFields[] = [];

    if (selectedAccountIds && selectedAccountIds.length > 0) {
      selectedAccountIds.forEach(id => {
        const acc = accountMap.get(id);
        if (acc) resolvedAccounts.push(acc);
      });
    } else if (selectedAccountId) {
      const acc = accountMap.get(selectedAccountId);
      if (acc) resolvedAccounts.push(acc);
    }

    if (resolvedAccounts.length === 0) return placeholder;

    // Single account — inline label
    if (resolvedAccounts.length === 1) {
      return <AccountInlineLabel account={resolvedAccounts[0]} />;
    }

    // Multiple accounts — chip badges
    return (
      <Box flexDirection="row" flexWrap="wrap" gap="xs" marginTop="xs">
        {resolvedAccounts.map(acc => {
          const chipColors = resolveAccountChipColors(acc, theme);
          return (
            <Box
              key={acc.id}
              style={{
                backgroundColor: chipColors.bg,
                borderColor: chipColors.border,
              }}
              flexDirection="row"
              alignItems="center"
              paddingHorizontal="sm"
              paddingVertical={2}
              borderRadius="r2"
              borderWidth={1}
            >
              <AccountInlineLabel
                account={acc}
                variant="caption"
                pillSize="sm"
                textColor={chipColors.text}
              />
            </Box>
          );
        })}
      </Box>
    );
  }, [accountMap, placeholder, selectedAccountId, selectedAccountIds, theme]);

  return (
    <ListRow title={title} subtitle={subtitle} onPress={onPress} style={style} testID={testID} />
  );
}
