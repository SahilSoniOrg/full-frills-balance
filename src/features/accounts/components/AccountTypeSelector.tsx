import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountAccentColor } from '@/src/utils/accountCategory';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface AccountTypeSelectorProps {
    value: AccountType;
    onChange: (type: AccountType) => void;
    disabled?: boolean;
}

const TYPE_METADATA: Record<AccountType, { label: string; icon: IconName }> = {
    [AccountType.ASSET]: { label: AppConfig.strings.accounts.types.asset, icon: 'wallet' },
    [AccountType.LIABILITY]: { label: AppConfig.strings.accounts.types.liability, icon: 'creditCard' },
    [AccountType.EQUITY]: { label: AppConfig.strings.accounts.types.equity, icon: 'bank' },
    [AccountType.INCOME]: { label: AppConfig.strings.accounts.types.income, icon: 'trendingUp' },
    [AccountType.EXPENSE]: { label: AppConfig.strings.accounts.types.expense, icon: 'arrowDown' },
};

export const AccountTypeSelector: React.FC<AccountTypeSelectorProps> = ({ value, onChange, disabled }) => {
    const { theme } = useTheme();

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
        >
            {(Object.keys(TYPE_METADATA) as AccountType[]).map((typeKey) => {
                const isSelected = value === typeKey;
                const meta = TYPE_METADATA[typeKey];
                const accountColor = getAccountAccentColor(typeKey, theme);

                return (
                    <TouchableOpacity
                        key={typeKey}
                        testID={`account-type-option-${typeKey}`}
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
                        onPress={() => onChange(typeKey)}
                        disabled={disabled}
                    >
                        <View style={[styles.indicator, { backgroundColor: accountColor, opacity: isSelected ? 1 : Opacity.soft }]} />
                        <AppIcon name={meta.icon} size={Size.iconXs} color={accountColor} fallbackIcon="wallet" />
                        <AppText
                            variant="body"
                            weight={isSelected ? "semibold" : "regular"}
                            style={{ color: theme.text }}
                        >
                            {meta.label}
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
        marginHorizontal: -Spacing.lg, // Bleed to edges
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
        minWidth: 120,
    },
    indicator: {
        width: 4,
        height: Spacing.md,
        borderRadius: Shape.radius.full,
    },
});

