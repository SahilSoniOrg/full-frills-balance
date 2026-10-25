import { AppIcon } from '@/src/components/core';
import { SelectionPickerSheet } from '@/src/components/filters/SelectionPickerSheet';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { Opacity } from '@/src/constants/design-tokens';
import { Box } from '@/src/design-system';
import {
  getAccountKind,
  getAccountSubtypeColor,
} from '@/src/features/accounts/helpers/accountKinds';
import { ACCOUNT_SUBTYPES_BY_TYPE } from '@/src/types/accountSubtype';
import type { AccountSubtype, AccountType } from '@/src/types/enums';
import { withOpacity } from '@/src/utils/color-math';
import { useMemo } from 'react';

export function AccountSubtypeSheet({
  visible,
  accountType,
  selectedSubtype,
  onSelect,
  onClose,
}: {
  visible: boolean;
  accountType: AccountType;
  selectedSubtype: AccountSubtype;
  onSelect: (subtype: AccountSubtype) => void;
  onClose: () => void;
}) {
  const options = useMemo(
    () =>
      ACCOUNT_SUBTYPES_BY_TYPE[accountType].map(subtype => {
        const kind = getAccountKind(accountType, subtype)!;
        const color = getAccountSubtypeColor(accountType, subtype);
        return {
          id: subtype,
          label: kind.label,
          testID: `account-subtype-${accountType.toLowerCase()}-${subtype.toLowerCase()}`,
          leading: (
            <Box
              width={40}
              height={40}
              borderRadius="lg"
              alignItems="center"
              justifyContent="center"
              unsafe_backgroundRaw={withOpacity(color, Opacity.soft)}
            >
              <AppIcon name={kind.icon} size={22} color={color} />
            </Box>
          ),
        };
      }),
    [accountType],
  );

  return (
    <SelectionPickerSheet
      visible={visible}
      title={copy.chooseSubtype}
      options={options}
      selectedValue={selectedSubtype}
      showSearch={false}
      fixedHeight={false}
      maxHeightPercent={85}
      onSelect={onSelect}
      onClose={onClose}
      accessibilityCloseLabel={copy.closeSheet}
      closeTestID="account-subtype-close"
    />
  );
}
