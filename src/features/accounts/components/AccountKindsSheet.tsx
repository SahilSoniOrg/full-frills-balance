import { FormRow } from '@/src/components/forms';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { ACCOUNT_SUBTYPES_BY_TYPE } from '@/src/types/accountSubtype';
import { AccountType } from '@/src/types/enums';
import {
  getAccountKind,
  type SuggestedAccountKind,
} from '@/src/features/accounts/helpers/accountKinds';

export function AccountKindsSheet({
  visible,
  onSelect,
  onClose,
  isCategory = false,
}: {
  visible: boolean;
  onSelect: (kind: SuggestedAccountKind) => void;
  onClose: () => void;
  isCategory?: boolean;
}) {
  return (
    <ModalSurface
      visible={visible}
      title={copy.allKinds}
      onClose={onClose}
      accessibilityCloseLabel={copy.closeSheet}
      closeTestID="account-all-kinds-close"
      position="bottomSheet"
      fixedHeight={false}
      maxHeightPercent={85}
    >
      {(isCategory
        ? [AccountType.EXPENSE, AccountType.INCOME]
        : [AccountType.ASSET, AccountType.LIABILITY]
      ).map(type => (
        <SectionGroup
          key={type}
          type={type}
          onSelect={kind => {
            onSelect(kind);
            onClose();
          }}
        />
      ))}
    </ModalSurface>
  );
}

function SectionGroup({
  type,
  onSelect,
}: {
  type: AccountType;
  onSelect: (kind: SuggestedAccountKind) => void;
}) {
  return (
    <>
      <SectionLabel
        label={
          type === AccountType.INCOME
            ? copy.incomeCategory
            : type === AccountType.EXPENSE
              ? copy.expenseCategory
              : type === AccountType.ASSET
                ? copy.assetCaption
                : copy.liabilityCaption
        }
      />
      {ACCOUNT_SUBTYPES_BY_TYPE[type].map(subtype => {
        const kind = getAccountKind(type, subtype)!;
        return (
          <FormRow
            key={subtype}
            icon={kind.icon}
            title={kind.label}
            onPress={() => onSelect(kind)}
            testID={`account-all-kinds-${type}-${subtype}`}
          />
        );
      })}
    </>
  );
}
