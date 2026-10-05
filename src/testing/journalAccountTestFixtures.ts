import type { AccountFields } from '@/src/types/plainDtos';

export function testAccountFields(
  partial: Partial<AccountFields> & Pick<AccountFields, 'id' | 'name' | 'accountType'>,
): AccountFields {
  return {
    currencyCode: 'USD',
    parentAccountId: null,
    ...partial,
  } as AccountFields;
}
