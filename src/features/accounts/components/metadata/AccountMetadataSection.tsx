import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { Spacing } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { isLiquidLiabilitySubtype, isLoanSubtype } from '@/src/utils/accountSubtypeUtils';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CreditCardMetadataFields } from './CreditCardMetadataFields';
import { LoanMetadataFields } from './LoanMetadataFields';
import { NotesMetadataField } from './NotesMetadataField';

interface AccountMetadataSectionProps {
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  // CC Fields
  statementDay: string;
  setStatementDay: (value: string) => void;
  dueDay: string;
  setDueDay: (value: string) => void;
  creditLimitAmount: string;
  setCreditLimitAmount: (value: string) => void;
  // Loan Fields
  emiDay: string;
  setEmiDay: (value: string) => void;
  loanTenureMonths: string;
  setLoanTenureMonths: (value: string) => void;
  minimumPaymentAmount: string;
  setMinimumPaymentAmount: (value: string) => void;
  payFromAccountId: string;
  payFromAccountName: string;
  setPayFromAccountId: (value: string) => void;
  setIsPayFromPickerVisible: (visible: boolean) => void;
  // General
  apr: string;
  setApr: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
}

export const AccountMetadataSection: React.FC<AccountMetadataSectionProps> = props => {
  const { accountType, accountSubtype, notes, setNotes } = props;

  const showLiabilityFields = accountType === AccountType.LIABILITY;
  const isCreditCard = isLiquidLiabilitySubtype(accountSubtype);
  const isLoan = isLoanSubtype(accountSubtype);
  const hasSpecificMetadata = isCreditCard || isLoan;

  if (!showLiabilityFields && !notes) return null;

  return (
    <FormSectionGroup title="Additional Info" style={styles.container}>
      {hasSpecificMetadata && (
        <View style={styles.group}>
          {isCreditCard && (
            <CreditCardMetadataFields
              statementDay={props.statementDay}
              setStatementDay={props.setStatementDay}
              dueDay={props.dueDay}
              setDueDay={props.setDueDay}
              creditLimitAmount={props.creditLimitAmount}
              setCreditLimitAmount={props.setCreditLimitAmount}
              apr={props.apr}
              setApr={props.setApr}
              payFromAccountName={props.payFromAccountName}
              setPayFromAccountId={props.setPayFromAccountId}
              setIsPayFromPickerVisible={props.setIsPayFromPickerVisible}
            />
          )}
          {isLoan && (
            <LoanMetadataFields
              emiDay={props.emiDay}
              setEmiDay={props.setEmiDay}
              loanTenureMonths={props.loanTenureMonths}
              setLoanTenureMonths={props.setLoanTenureMonths}
              minimumPaymentAmount={props.minimumPaymentAmount}
              setMinimumPaymentAmount={props.setMinimumPaymentAmount}
              apr={props.apr}
              setApr={props.setApr}
            />
          )}
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
