import { TransactionListView } from '@/src/components/common/TransactionListView';
import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useInsightDetailsViewModel } from '../hooks/useInsightDetailsViewModel';

export default function InsightDetailsScreen() {
    const { theme, fonts } = useTheme();
    const params = useLocalSearchParams<{
        id: string;
        message: string;
        suggestion: string;
        journalIds: string;
        severity: string;
    }>();

    const journalIds = useMemo(() =>
        params.journalIds ? params.journalIds.split(',') : []
        , [params.journalIds]);

    const { items, isLoading } = useInsightDetailsViewModel({ journalIds });

    const listHeader = (
        <View style={styles.headerContainer}>
            <View style={[
                styles.hero,
                {
                    backgroundColor: withOpacity(theme[params.severity === 'high' ? 'error' : params.severity === 'medium' ? 'warning' : 'primary'], Opacity.soft),
                    borderColor: theme[params.severity === 'high' ? 'error' : params.severity === 'medium' ? 'warning' : 'primary']
                }
            ]}>
                <View style={styles.iconCircle}>
                    <AppIcon
                        name={params.id?.startsWith('sub_') ? 'repeat' : 'trendingUp'}
                        size={Size.md}
                        color={theme[params.severity === 'high' ? 'error' : params.severity === 'medium' ? 'warning' : 'primary']}
                    />
                </View>
                <AppText variant="title" style={{ fontFamily: fonts.bold, marginTop: Spacing.md }}>
                    {params.message}
                </AppText>
                <AppText variant="body" color="secondary" style={styles.suggestion}>
                    💡 {params.suggestion}
                </AppText>
            </View>
            <AppText variant="subheading" color="secondary" style={styles.listTitle}>
                {AppConfig.strings.dashboard.triggeringTransactionsTitle}
            </AppText>
        </View>
    );

    return (
        <Screen title="Insight Details" withPadding={false}>
            <TransactionListView
                items={items}
                isLoading={isLoading}
                ListHeaderComponent={listHeader}
                contentContainerStyle={styles.listContent}
                emptyTitle="No transactions found"
                emptySubtitle="The transactions for this insight might have been deleted."
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    headerContainer: {
        padding: Spacing.lg,
    },
    hero: {
        padding: Spacing.xl,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    suggestion: {
        textAlign: 'center',
        marginTop: Spacing.sm,
    },
    listTitle: {
        marginBottom: Spacing.md,
    },
    listContent: {
        paddingBottom: Spacing.xl * 2,
    },
});
