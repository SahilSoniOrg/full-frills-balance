import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { Spacing } from '@/src/constants';
import { AccountSubtype, AccountType } from '@/src/types/enums';

import { Separator } from '@/src/design-system';
import { AccountMetadataFormModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { isLiquidLiabilitySubtype, isLoanSubtype } from '@/src/utils/accountSubtypeUtils';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CreditCardMetadataFields } from './CreditCardMetadataFields';
import { LoanMetadataFields } from './LoanMetadataFields';
import { NotesMetadataField } from './NotesMetadataField';

interface AccountMetadataSectionProps {
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  metadata: AccountMetadataFormModel;
}

export const AccountMetadataSection: React.FC<AccountMetadataSectionProps> = props => {
  const { accountType, accountSubtype, metadata } = props;
  const { notes, setNotes } = metadata;

  const showLiabilityFields = accountType === AccountType.LIABILITY;
  const isCreditCard = isLiquidLiabilitySubtype(accountSubtype);
  const isLoan = isLoanSubtype(accountSubtype);
  const hasSpecificMetadata = isCreditCard || isLoan;

  if (!showLiabilityFields && !notes) return null;

  return (
    <FormSectionGroup title="Additional Info" style={styles.container}>
      {hasSpecificMetadata && (
        <View style={styles.group}>
          {isCreditCard && <CreditCardMetadataFields metadata={metadata} />}
          {isLoan && <LoanMetadataFields metadata={metadata} />}
        </View>
      )}

      {hasSpecificMetadata ? <Separator /> : null}

      <View style={styles.group}>
        <NotesMetadataField notes={notes} setNotes={setNotes} />
      </View>
    </FormSectionGroup>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
  },
  group: {
    gap: Spacing.md,
  },
});
