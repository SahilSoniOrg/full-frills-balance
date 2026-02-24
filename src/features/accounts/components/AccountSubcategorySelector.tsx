import { AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import {
    AccountSubcategory,
    AccountType,
    formatAccountSubcategoryLabel,
    getAccountSubcategoriesForType,
} from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface AccountSubcategorySelectorProps {
    accountType: AccountType;
    value: AccountSubcategory;
    onChange: (subcategory: AccountSubcategory) => void;
    disabled?: boolean;
}

export const AccountSubcategorySelector: React.FC<AccountSubcategorySelectorProps> = ({
    accountType,
    value,
    onChange,
    disabled,
}) => {
    const { theme, fonts } = useTheme();
    const subcategories = getAccountSubcategoriesForType(accountType);

    return (
        <View style={styles.container}>
            {subcategories.map((subcategory) => (
                <TouchableOpacity
                    key={subcategory}
                    testID={`account-subcategory-option-${subcategory}`}
                    style={[
                        styles.button,
                        value === subcategory && styles.buttonSelected,
                        {
                            borderColor: theme.border,
                            backgroundColor: value === subcategory ? theme.primary : theme.surface,
                            opacity: disabled ? Opacity.medium : Opacity.solid,
                        },
                    ]}
                    onPress={() => onChange(subcategory)}
                    disabled={disabled}
                >
                    <AppText
                        variant="body"
                        style={[
                            styles.text,
                            {
                                color: value === subcategory ? theme.pureInverse : theme.text,
                                fontFamily: value === subcategory ? fonts.bold : fonts.medium,
                            },
                        ]}
                    >
                        {formatAccountSubcategoryLabel(subcategory)}
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
