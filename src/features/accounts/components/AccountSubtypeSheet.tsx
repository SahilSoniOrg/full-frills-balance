import { AppIcon, Icon, ListGroup, ListRow } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { Opacity } from '@/src/constants/design-tokens';
import { Box } from '@/src/design-system';
import {
  getAccountKind,
  getAccountSubtypeColor,
} from '@/src/features/accounts/helpers/accountKinds';
import { useTheme } from '@/src/hooks/use-theme';
import { ACCOUNT_SUBTYPES_BY_TYPE } from '@/src/types/accountSubtype';
import type { AccountSubtype, AccountType } from '@/src/types/enums';
import { withOpacity } from '@/src/utils/color-math';

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
  const { theme } = useTheme();
  return (
    <ModalSurface
      visible={visible}
      title={copy.chooseSubtype}
      onClose={onClose}
      accessibilityCloseLabel={copy.closeSheet}
      closeTestID="account-subtype-close"
      position="bottomSheet"
      fixedHeight={false}
      maxHeightPercent={85}
    >
      <ListGroup variant="plain">
        {ACCOUNT_SUBTYPES_BY_TYPE[accountType].map(subtype => {
          const kind = getAccountKind(accountType, subtype)!;
          const color = getAccountSubtypeColor(accountType, subtype);
          const selected = subtype === selectedSubtype;
          return (
            <ListRow
              key={subtype}
              title={kind.label}
              leading={
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
              }
              trailing={
                <AppIcon
                  name={selected ? Icon.Check : Icon.ChevronRight}
                  size={selected ? 20 : 18}
                  color={selected ? 'primary' : theme.textSecondary}
                />
              }
              onPress={() => {
                onSelect(subtype);
                onClose();
              }}
              testID={`account-subtype-${accountType.toLowerCase()}-${subtype.toLowerCase()}`}
            />
          );
        })}
      </ListGroup>
    </ModalSurface>
  );
}
