import { AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import {
    AccountSubtype,
    AccountType,
    formatAccountSubtypeLabel,
    getAccountSubtypesForType,
} from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountAccentColor } from '@/src/utils/accountCategory';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

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
    const { theme } = useTheme();
    const subtypes = getAccountSubtypesForType(accountType);
    const accountColor = getAccountAccentColor(accountType, theme);

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
        >
            {subtypes.map((subtype) => {
                const isSelected = value === subtype;
                return (
                    <TouchableOpacity
                        key={subtype}
                        testID={`account-subtype-option-${subtype}`}
                        style={[
                            styles.tile,
                            {
                                backgroundColor: theme.surface,
                                borderColor: withOpacity(theme.textSecondary, Opacity.muted)
                            },
                            isSelected && {
                                backgroundColor: withOpacity(accountColor, Opacity.soft),
                                borderColor: withOpacity(accountColor, Opacity.medium)
                            },
                        ]}
                        onPress={() => onChange(subtype)}
                        disabled={disabled}
                    >
                        <View style={[styles.indicator, { backgroundColor: accountColor, opacity: isSelected ? 1 : Opacity.soft }]} />
                        <AppText
                            variant="body"
                            weight={isSelected ? "semibold" : "regular"}
                            style={{ color: theme.text }}
                        >
                            {formatAccountSubtypeLabel(subtype)}
                        </AppText>
                        {isSelected && (
                            <AppIcon name="checkCircle" size={Size.iconSm} color={accountColor} />
                        )}
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scrollView: {
        marginHorizontal: -Spacing.lg,
    },
    scrollContent: {
        paddingHorizontal: Spacing.lg,
        gap: Spacing.sm,
        paddingVertical: Spacing.xs,
    },
    tile: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: Shape.radius.r4,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        minWidth: 100,
    },
    indicator: {
        width: 4,
        height: Spacing.md,
        borderRadius: Shape.radius.full,
    },
});

