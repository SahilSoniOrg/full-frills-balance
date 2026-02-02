import { AppText } from '@/src/components/core';
import { Opacity, Shape, Spacing, Typography } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface AccountTypeSelectorProps {
    value: AccountType;
    onChange: (type: AccountType) => void;
}

export const AccountTypeSelector: React.FC<AccountTypeSelectorProps> = ({ value, onChange }) => {
    const { theme } = useTheme();

    const accountTypes = [
        { key: AccountType.ASSET, label: 'Asset' },
        { key: AccountType.LIABILITY, label: 'Liability' },
        { key: AccountType.EQUITY, label: 'Equity' },
        { key: AccountType.INCOME, label: 'Income' },
        { key: AccountType.EXPENSE, label: 'Expense' },
    ];

    return (
        <View style={styles.container}>
            {accountTypes.map((type) => (
                <TouchableOpacity
                    key={type.key}
                    style={[
                        styles.button,
                        value === type.key && styles.buttonSelected,
                        {
                            borderColor: theme.border,
                            backgroundColor: value === type.key ? theme.primary : theme.surface,
                            opacity: Opacity.solid,
                        },
                    ]}
                    onPress={() => onChange(type.key as AccountType)}
                >
                    <AppText
                        variant="body"
                        style={[
                            styles.text,
                            value === type.key && styles.textSelected,
                            {
                                color: value === type.key ? theme.pureInverse : theme.text,
                            },
                        ]}
                    >
                        {type.label}
                    </AppText>
                </TouchableOpacity>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
    },
    button: {
        borderWidth: 1,
        borderRadius: Shape.radius.full,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        minWidth: 96,
    },
    buttonSelected: {
        borderWidth: 2,
    },
    text: {
        textAlign: 'center',
        fontFamily: Typography.fonts.medium,
    },
    textSelected: {
        fontFamily: Typography.fonts.bold,
    },
});
