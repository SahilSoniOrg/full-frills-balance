import { AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import {
    AccountSubtype,
    AccountType,
    formatAccountSubtypeLabel,
    getAccountSubtypesForType,
} from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface AccountSubtypeSelectorProps {
    accountType: AccountType;
    value: AccountSubtype;
    onChange: (subtype: AccountSubtype) => void;
    disabled?: boolean;
}

export const AccountSubtypeSelector: React.FC<AccountSubtypeSelectorProps> = ({
    accountType,
    value,
    onChange,
    disabled,
}) => {
    const { theme, fonts } = useTheme();
    const subtypes = getAccountSubtypesForType(accountType);

    return (
        <View style={styles.container}>
            {subtypes.map((subtype) => (
                <TouchableOpacity
                    key={subtype}
                    testID={`account-subtype-option-${subtype}`}
                    style={[
                        styles.button,
                        value === subtype && styles.buttonSelected,
                        {
                            borderColor: theme.border,
                            backgroundColor: value === subtype ? theme.primary : theme.surface,
                            opacity: disabled ? Opacity.medium : Opacity.solid,
                        },
                    ]}
                    onPress={() => onChange(subtype)}
                    disabled={disabled}
                >
                    <AppText
                        variant="body"
                        style={[
                            styles.text,
                            {
                                color: value === subtype ? theme.pureInverse : theme.text,
                                fontFamily: value === subtype ? fonts.bold : fonts.medium,
                            },
                        ]}
                    >
                        {formatAccountSubtypeLabel(subtype)}
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
        minWidth: Size.buttonXl * 1.2,
    },
    buttonSelected: {
        borderWidth: 2,
    },
    text: {
        textAlign: 'center',
    },
});
