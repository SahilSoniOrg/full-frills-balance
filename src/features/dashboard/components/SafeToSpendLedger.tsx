import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Badge } from '@/src/components/core';
import { Shape, Spacing, Typography, withOpacity } from '@/src/constants';
import { Stack, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountSubtype, formatAccountSubtypeLabel } from '@/src/data/models/Account';

interface SafeToSpendLedgerProps {
    labels: any;
    formatValue: (val: number) => string | React.ReactNode;
    liquidAssetSubtypes: AccountSubtype[];
    liquidAssetAccounts: { name: string, amount: number }[];
}

export const SafeToSpendLedger = ({
    labels,
    formatValue,
    liquidAssetSubtypes,
    liquidAssetAccounts,
}: SafeToSpendLedgerProps) => {
    const { theme } = useTheme();

    return (
        <Stack gap="md">
            <Text
                variant="heading"
                style={{ fontSize: Typography.sizes.lg + 2 }}
                marginBottom="xs"
            >
                {/* title passed if needed */}
            </Text>

            <Stack gap="sm">
                <Text variant="xs" weight="bold" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 10 }}>
                    {labels.categoriesUsed}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
                    {liquidAssetSubtypes.length > 0 ? (
                        liquidAssetSubtypes.map((st, i) => (
                            <Badge key={i} size="sm" variant="secondary" style={{ backgroundColor: withOpacity(theme.surfaceSecondary, 0.8) }}>
                                {formatAccountSubtypeLabel(st)}
                            </Badge>
                        ))
                    ) : (
                        <Text variant="xs" color="secondary" italic>{labels.noneDetectedYet}</Text>
                    )}
                </View>
            </Stack>

            <View style={{ gap: Spacing.sm, marginTop: Spacing.xs }}>
                <AppText variant="caption" weight="bold" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 10 }}>
                    {labels.accountsUsed}
                </AppText>
                <View style={{ gap: Spacing.xs }}>
                    {(() => {
                        const positiveAccounts: any[] = [];
                        const zeroAccounts: any[] = [];

                        liquidAssetAccounts.forEach(acc => {
                            if (acc.amount === 0) {
                                zeroAccounts.push(acc);
                            } else {
                                positiveAccounts.push(acc);
                            }
                        });

                        const renderAccount = (acc: any, index: number, isZero: boolean) => (
                            <View key={index} style={[styles.breakdownRow, {
                                backgroundColor: withOpacity(theme.surfaceSecondary, isZero ? 0.2 : 0.4),
                                paddingHorizontal: Spacing.sm,
                                paddingVertical: Spacing.xs,
                                borderRadius: Shape.radius.sm,
                                opacity: isZero ? 0.5 : 1
                            }]}>
                                <AppText variant="caption" weight={isZero ? "regular" : "medium"} style={{ flex: 1 }}>{acc.name}</AppText>
                                <AppText variant="caption" weight="bold" color="secondary">{formatValue(acc.amount)}</AppText>
                            </View>
                        );

                        if (positiveAccounts.length === 0) {
                            return <AppText variant="caption" color="secondary" italic>{labels.noneDetectedYet}</AppText>;
                        }

                        return (
                            <>
                                {positiveAccounts.map((acc, i) => renderAccount(acc, i, false))}
                            </>
                        );
                    })()}
                </View>
            </View>
        </Stack>
    );
};

const styles = StyleSheet.create({
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
});
