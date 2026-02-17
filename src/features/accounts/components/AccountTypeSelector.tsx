import { AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface AccountTypeSelectorProps {
    value: AccountType;
    onChange: (type: AccountType) => void;
    disabled?: boolean;
}

export const AccountTypeSelector: React.FC<AccountTypeSelectorProps> = ({ value, onChange, disabled }) => {
    const { theme, fonts } = useTheme();

    const accountTypes = [
        { key: AccountType.ASSET, label: AppConfig.strings.accounts.types.asset },
        { key: AccountType.LIABILITY, label: AppConfig.strings.accounts.types.liability },
        { key: AccountType.EQUITY, label: AppConfig.strings.accounts.types.equity },
        { key: AccountType.INCOME, label: AppConfig.strings.accounts.types.income },
        { key: AccountType.EXPENSE, label: AppConfig.strings.accounts.types.expense },
    ];

    return (
        <View style={styles.container}>
            {accountTypes.map((type) => (
                <TouchableOpacity
                    key={type.key}
                    testID={`account-type-option-${type.key}`}
                    style={[
                        styles.button,
                        value === type.key && styles.buttonSelected,
                        {
                            borderColor: theme.border,
                            backgroundColor: value === type.key ? theme.primary : theme.surface,
                            opacity: disabled ? Opacity.medium : Opacity.solid,
                        },
                    ]}
                    onPress={() => onChange(type.key as AccountType)}
                    disabled={disabled}
                >
                    <AppText
                        variant="body"
                        style={[
                            styles.text,
                            value === type.key && styles.textSelected,
                            {
                                color: value === type.key ? theme.pureInverse : theme.text,
                                fontFamily: value === type.key ? fonts.bold : fonts.medium
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
        minWidth: Size.buttonXl * 1.5,
    },
    buttonSelected: {
        borderWidth: 2,
    },
    text: {
        textAlign: 'center',
        // dynamic font
    },
    textSelected: {
        // dynamic font
    },
});
