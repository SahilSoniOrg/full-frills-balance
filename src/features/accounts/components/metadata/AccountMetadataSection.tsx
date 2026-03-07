import { AppCard, AppText } from '@/src/components/core';
import { Spacing, Typography } from '@/src/constants';
import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
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
    // General
    apr: string;
    setApr: (value: string) => void;
    notes: string;
    setNotes: (value: string) => void;
}

export const AccountMetadataSection: React.FC<AccountMetadataSectionProps> = (props) => {
    const { theme } = useTheme();
    const { accountType, accountSubtype, notes, setNotes } = props;

    const showLiabilityFields = accountType === AccountType.LIABILITY;
    const isCreditCard = isLiquidLiabilitySubtype(accountSubtype);
    const isLoan = isLoanSubtype(accountSubtype);
    const hasSpecificMetadata = isCreditCard || isLoan;

    if (!showLiabilityFields && !notes) return null;

    return (
        <View style={styles.container}>
            <AppText variant="body" weight="semibold" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                ADDITIONAL INFO
            </AppText>

            {hasSpecificMetadata && (
                <AppCard elevation="sm" padding="lg" style={styles.card}>
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
                </AppCard>
            )}

            <AppCard elevation="sm" padding="lg" style={styles.card}>
                <NotesMetadataField notes={notes} setNotes={setNotes} />
            </AppCard>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: Spacing.sm,
        marginBottom: Spacing.xl,
    },
    sectionTitle: {
        fontSize: Typography.sizes.sm,
        letterSpacing: 1.5,
        marginLeft: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    card: {
        marginBottom: Spacing.md,
    },
});
