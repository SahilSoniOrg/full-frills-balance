import { AppCard, AppIcon, AppText, EmptyStateView, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule';
import { useTheme } from '@/src/hooks/use-theme';
import { withObservables } from '@nozbe/watermelondb/react';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

interface Props {
    rules: SmsAutoPostRule[];
}

function SmsRulesList({ rules }: Props) {
    const { theme } = useTheme();
    const router = useRouter();

    if (rules.length === 0) {
        return (
            <EmptyStateView
                title="No Auto-Post Rules"
                subtitle="Automatically post journal entries when matching SMS messages are received."
            />
        );
    }

    return (
        <FlatList
            data={rules}
            keyExtractor={r => r.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => router.push(`/sms-rule-form?id=${item.id}` as any)}
                >
                    <AppCard elevation="sm" style={styles.card}>
                        <View style={styles.cardHeader}>
                            <AppText variant="subheading" weight="semibold">
                                {item.senderMatch}
                            </AppText>
                            <View style={[
                                styles.statusBadge,
                                { backgroundColor: item.isActive ? withOpacity(theme.success, Opacity.soft) : withOpacity(theme.textSecondary, Opacity.soft) }
                            ]}>
                                <AppText variant="caption" style={{ color: item.isActive ? theme.success : theme.textSecondary }}>
                                    {item.isActive ? 'Active' : 'Inactive'}
                                </AppText>
                            </View>
                        </View>
                        {item.bodyMatch && (
                            <AppText variant="body" color="secondary" style={styles.bodyMatch}>
                                Match text: {item.bodyMatch}
                            </AppText>
                        )}
                        <View style={styles.accountsRow}>
                            <AppText variant="caption" color="secondary">
                                Source Acc ID: {item.sourceAccountId}
                            </AppText>
                            <AppIcon name="arrowRight" size={14} color={theme.textSecondary} style={{ marginHorizontal: Spacing.xs }} />
                            <AppText variant="caption" color="secondary">
                                Category Acc ID: {item.categoryAccountId}
                            </AppText>
                        </View>
                    </AppCard>
                </TouchableOpacity>
            )}
        />
    );
}

const EnhancedSmsRulesList = withObservables([], () => ({
    rules: database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').query().observe()
}))(SmsRulesList);

export default function SmsRulesScreen() {
    const router = useRouter();

    return (
        <Screen
            title="SMS Auto-Post Rules"
            showBack={true}
            scrollable={false}
        >
            <EnhancedSmsRulesList />
            <FloatingActionButton
                onPress={() => router.push('/sms-rule-form' as any)}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    list: {
        padding: Spacing.md,
        paddingBottom: Spacing.xxxl,
    },
    card: {
        marginBottom: Spacing.md,
        padding: Spacing.md,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    statusBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: 12,
    },
    bodyMatch: {
        marginBottom: Spacing.sm,
    },
    accountsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
});
