import { AppIcon } from '@/src/components/core';
import { SelectionPickerSheet } from '@/src/components/filters/SelectionPickerSheet';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { Opacity } from '@/src/constants/design-tokens';
import { Box } from '@/src/design-system';
import {
  getAccountTypeDescription,
  getAccountTypeIcon,
} from '@/src/features/accounts/helpers/accountKinds';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountType } from '@/src/types/enums';
import { withOpacity } from '@/src/utils/color-math';
import { useMemo } from 'react';

const ACCOUNT_TYPES = [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY] as const;
const CATEGORY_TYPES = [AccountType.EXPENSE, AccountType.INCOME] as const;

export function AccountTypeSheet({
  visible,
  isCategory,
  showAllTypes,
  selectedType,
  onSelect,
  onClose,
}: {
  visible: boolean;
  isCategory: boolean;
  showAllTypes: boolean;
  selectedType: AccountType;
  onSelect: (type: AccountType) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const options = useMemo(() => {
    const types = showAllTypes
      ? [...ACCOUNT_TYPES, ...CATEGORY_TYPES]
      : isCategory
        ? CATEGORY_TYPES
        : ACCOUNT_TYPES;
    return types.map(type => {
      const color = typeColor(type, theme);
      return {
        id: type,
        label: copy.typeNames[type],
        description: getAccountTypeDescription(type),
        testID: `account-type-${type.toLowerCase()}`,
        leading: (
          <Box
            width={40}
            height={40}
            borderRadius="lg"
            alignItems="center"
            justifyContent="center"
            unsafe_backgroundRaw={withOpacity(color, Opacity.soft)}
          >
            <AppIcon name={getAccountTypeIcon(type)} size={22} color={color} />
          </Box>
        ),
      };
    });
  }, [isCategory, showAllTypes, theme]);

  return (
    <SelectionPickerSheet
      visible={visible}
      title={copy.chooseType}
      options={options}
      selectedValue={selectedType}
      showSearch={false}
      fixedHeight={false}
      maxHeightPercent={70}
      onSelect={onSelect}
      onClose={onClose}
      accessibilityCloseLabel={copy.closeSheet}
      closeTestID="account-type-close"
    />
  );
}

function typeColor(type: AccountType, theme: ReturnType<typeof useTheme>['theme']): string {
  switch (type) {
    case AccountType.ASSET:
      return theme.asset;
    case AccountType.LIABILITY:
      return theme.liability;
    case AccountType.EQUITY:
      return theme.equity;
    case AccountType.INCOME:
      return theme.income;
    case AccountType.EXPENSE:
      return theme.expense;
  }
}
