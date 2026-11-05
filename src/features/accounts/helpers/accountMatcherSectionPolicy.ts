import { AccountType } from '@/src/types/enums';

export function shouldShowAccountMatchersSection(input: {
  featureEnabled: boolean;
  isEditMode: boolean;
  isParent: boolean;
  isCategory: boolean;
  accountType: AccountType;
}): boolean {
  return (
    input.featureEnabled &&
    input.isEditMode &&
    !input.isParent &&
    !input.isCategory &&
    (input.accountType === AccountType.ASSET || input.accountType === AccountType.LIABILITY)
  );
}
