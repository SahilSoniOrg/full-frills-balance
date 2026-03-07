import { AppInput } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface CreditCardMetadataFieldsProps {
    statementDay: string;
    setStatementDay: (value: string) => void;
    dueDay: string;
    setDueDay: (value: string) => void;
    creditLimitAmount: string;
    setCreditLimitAmount: (value: string) => void;
    apr: string;
    setApr: (value: string) => void;
}

export const CreditCardMetadataFields: React.FC<CreditCardMetadataFieldsProps> = ({
    statementDay,
    setStatementDay,
    dueDay,
    setDueDay,
    creditLimitAmount,
    setCreditLimitAmount,
    apr,
    setApr,
}) => {
    return (
        <>
            <View style={styles.row}>
                <View style={{ flex: 1 }}>
                    <AppInput
                        label="Statement Day"
                        value={statementDay}
                        onChangeText={setStatementDay}
                        placeholder="e.g. 15"
                        keyboardType="number-pad"
                        maxLength={2}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <AppInput
                        label="Due Day"
                        value={dueDay}
                        onChangeText={setDueDay}
                        placeholder="e.g. 5"
                        keyboardType="number-pad"
                        maxLength={2}
                    />
                </View>
            </View>
            <View style={styles.row}>
                <View style={{ flex: 2 }}>
                    <AppInput
                        label="Credit Limit"
                        value={creditLimitAmount}
                        onChangeText={setCreditLimitAmount}
                        placeholder="Enter credit limit"
                        keyboardType="decimal-pad"
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <AppInput
                        label="APR (%)"
                        value={apr}
                        onChangeText={setApr}
                        placeholder="e.g. 15.5"
                        keyboardType="decimal-pad"
                    />
                </View>
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
});
