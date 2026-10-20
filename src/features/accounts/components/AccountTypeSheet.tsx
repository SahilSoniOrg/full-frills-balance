import { AppIcon, Icon, ListGroup, ListRow } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
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
  const types = showAllTypes
    ? [...ACCOUNT_TYPES, ...CATEGORY_TYPES]
    : isCategory
      ? CATEGORY_TYPES
      : ACCOUNT_TYPES;
  return (
    <ModalSurface
      visible={visible}
      title={copy.chooseType}
      onClose={onClose}
      accessibilityCloseLabel={copy.closeSheet}
      closeTestID="account-type-close"
      position="bottomSheet"
      fixedHeight={false}
      maxHeightPercent={70}
    >
      <ListGroup variant="plain">
        {types.map(type => {
          const color = typeColor(type, theme);
          const selected = type === selectedType;
          return (
            <ListRow
              key={type}
              title={copy.typeNames[type]}
              subtitle={getAccountTypeDescription(type)}
              leading={
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
              }
              trailing={
                <AppIcon
                  name={selected ? Icon.Check : Icon.ChevronRight}
                  size={selected ? 20 : 18}
                  color={selected ? 'primary' : theme.textSecondary}
                />
              }
              onPress={() => {
                onSelect(type);
                onClose();
              }}
              testID={`account-type-${type.toLowerCase()}`}
            />
          );
        })}
      </ListGroup>
    </ModalSurface>
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
