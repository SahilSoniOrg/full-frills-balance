import { AppButton, Icon, ListGroup } from '@/src/components/core';
import { DayOfMonthSheet, FormRow } from '@/src/components/forms';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { AccountType, type AccountSubtype } from '@/src/types/enums';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { Spacing } from '@/src/constants/design-tokens';
import type { AccountMetadataFormModel } from '@/src/features/accounts/hooks/form/useAccountFormMetadata';
import { isLiquidLiabilitySubtype, isLoanSubtype } from '@/src/utils/accountSubtypeUtils';
import { CreditCardMetadataFields } from './CreditCardMetadataFields';
import { LoanMetadataFields } from './LoanMetadataFields';
import { View } from 'react-native';

export function AccountMetadataSection({
  accountType,
  accountSubtype,
  metadata,
  precision = 2,
}: {
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  metadata: AccountMetadataFormModel;
  precision?: number;
}) {
  const isCard = accountType === AccountType.LIABILITY && isLiquidLiabilitySubtype(accountSubtype);
  const isLoan = accountType === AccountType.LIABILITY && isLoanSubtype(accountSubtype);
  const close = () => metadata.setActiveSheet(null);
  if (!isCard && !isLoan) return null;
  return (
    <View>
      <View style={{ paddingHorizontal: Spacing.lg }}>
        <SectionLabel label={isCard ? copy.cardDetails : copy.loanDetails} />
      </View>
      <ListGroup variant="plain">
        {isCard && (
          <FormRow
            icon={Icon.Calendar}
            title={copy.statementDay}
            value={metadata.statementDayLabel}
            placeholder={copy.add}
            onPress={() => metadata.setActiveSheet('statementDay')}
            onClear={metadata.statementDay ? () => metadata.setStatementDay('') : undefined}
            testID="account-statement-day"
          />
        )}
        {isCard && (
          <FormRow
            icon={Icon.Calendar}
            title={copy.dueDay}
            value={metadata.dueDayLabel}
            placeholder={copy.add}
            onPress={() => metadata.setActiveSheet('dueDay')}
            onClear={metadata.dueDay ? () => metadata.setDueDay('') : undefined}
            testID="account-due-day"
          />
        )}
        {!isCard && (
          <FormRow
            icon={Icon.Calendar}
            title={copy.emiDay}
            value={metadata.emiDayLabel}
            placeholder={copy.add}
            onPress={() => metadata.setActiveSheet('emiDay')}
            onClear={metadata.emiDay ? () => metadata.setEmiDay('') : undefined}
            testID="account-emi-day"
          />
        )}
        <FormRow
          icon={Icon.Bank}
          title={copy.payFrom}
          value={metadata.payFromAccountId ? metadata.payFromAccountName : null}
          placeholder={copy.none}
          onPress={() => metadata.setIsPayFromPickerVisible(true)}
          onClear={
            metadata.payFromAccountId
              ? () => metadata.setPayFromAccountId(EMPTY_ACCOUNT_ID)
              : undefined
          }
          testID="account-pay-from"
        />
        <FormRow
          icon={Icon.Calculator}
          title={isCard ? copy.limitAndInterest : copy.rateAndTerm}
          subtitle={copy.projections}
          onPress={() => metadata.setActiveSheet(isCard ? 'credit' : 'loan')}
          testID={isCard ? 'account-limit-interest' : 'account-rate-term'}
        />
      </ListGroup>
      <DayOfMonthSheet
        visible={metadata.activeSheet === 'statementDay'}
        title={copy.statementDay}
        value={metadata.statementDayValue}
        onSelect={day => metadata.setStatementDay(String(day))}
        onClose={close}
        testID="account-statement-day-grid"
      />
      <DayOfMonthSheet
        visible={metadata.activeSheet === 'dueDay'}
        title={copy.dueDay}
        value={metadata.dueDayValue}
        onSelect={day => metadata.setDueDay(String(day))}
        onClose={close}
        testID="account-due-day-grid"
      />
      <DayOfMonthSheet
        visible={metadata.activeSheet === 'emiDay'}
        title={copy.emiDay}
        value={metadata.emiDayValue}
        onSelect={day => metadata.setEmiDay(String(day))}
        onClose={close}
        testID="account-emi-day-grid"
      />
      <ModalSurface
        visible={metadata.activeSheet === 'credit' || metadata.activeSheet === 'loan'}
        title={isCard ? copy.limitAndInterest : copy.rateAndTerm}
        onClose={close}
        accessibilityCloseLabel={copy.closeSheet}
        closeTestID="account-finance-sheet-close"
        position="bottomSheet"
        fixedHeight={false}
        maxHeightPercent={90}
        footer={
          <AppButton onPress={close} testID="account-finance-sheet-done">
            {copy.done}
          </AppButton>
        }
      >
        {isCard ? (
          <CreditCardMetadataFields metadata={metadata} precision={precision} />
        ) : (
          <LoanMetadataFields metadata={metadata} precision={precision} />
        )}
      </ModalSurface>
    </View>
  );
}
