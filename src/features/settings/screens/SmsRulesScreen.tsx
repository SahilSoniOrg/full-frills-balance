import { AppCard, AppIcon, AppText, EmptyStateView, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule';
import { useAccounts } from '@/src/features/accounts';
import { useTheme } from '@/src/hooks/use-theme';
import { SmsRuleCondition, smsService, SmsRuleSuggestion } from '@/src/services/sms-service';
import { AppNavigation } from '@/src/utils/navigation';
import { withObservables } from '@nozbe/watermelondb/react';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

interface Props {
    rules: SmsAutoPostRule[];
}

function getConditions(rule: SmsAutoPostRule): SmsRuleCondition[] {
    if (!rule.conditionsJson) return [];
    try {
        const parsed = JSON.parse(rule.conditionsJson);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function getActionLabel(rule: SmsAutoPostRule) {
    if (!rule.actionsJson) return 'Auto-post';
    try {
        const parsed = JSON.parse(rule.actionsJson);
        if (parsed?.disposition === 'ignore') return 'Ignore';
        if (parsed?.disposition === 'review') return 'Review';
    } catch {
        // fallback below
    }
    return 'Auto-post';
}

function getConditionSummary(rule: SmsAutoPostRule) {
    const conditions = getConditions(rule);
    if (conditions.length === 0) {
        return rule.bodyMatch ? `Regex: ${rule.senderMatch} / ${rule.bodyMatch}` : `Regex: ${rule.senderMatch}`;
    }

    return conditions.map((condition) => {
        switch (condition.field) {
            case 'sender':
                return `Sender contains "${condition.value}"`;
            case 'body':
                return `Body contains "${condition.value}"`;
            case 'merchant':
                return `Merchant contains "${condition.value}"`;
            case 'account_source':
                return `Source contains "${condition.value}"`;
            case 'direction':
                return `Direction is ${condition.value}`;
            case 'currency':
                return `Currency is ${condition.value}`;
            case 'amount':
                if (condition.operator === 'between') {
                    return `Amount between ${condition.minValue} and ${condition.maxValue}`;
                }
                return `Amount ${condition.operator} ${condition.minValue}`;
            default:
                return null;
        }
    }).filter(Boolean).join(' • ');
}

function SmsRulesList({ rules }: Props) {
    const { theme } = useTheme();
    const { accounts } = useAccounts();
    const accountMap = new Map(accounts.map((account) => [account.id, account.name]));
    const [suggestions, setSuggestions] = useState<SmsRuleSuggestion[]>([]);

    useEffect(() => {
        let isMounted = true;
        smsService.getRuleSuggestions()
            .then((items) => {
                if (isMounted) setSuggestions(items);
            })
            .catch(() => {
                if (isMounted) setSuggestions([]);
            });
        return () => {
            isMounted = false;
        };
    }, [rules.length]);

    if (rules.length === 0) {
        return (
            <FlatList
                data={[]}
                keyExtractor={(_, index) => `empty-${index}`}
                ListHeaderComponent={(
                    <>
                        {suggestions.length > 0 && (
                            <View style={styles.suggestionsSection}>
                                <AppText variant="subheading" style={styles.suggestionsTitle}>Suggested Rules</AppText>
                                {suggestions.map((suggestion) => (
                                    <AppCard key={`${suggestion.senderMatch}-${suggestion.categoryAccountId}`} elevation="sm" style={styles.card}>
                                        <AppText variant="body" weight="semibold">
                                            {suggestion.senderMatch}
                                        </AppText>
                                        <AppText variant="caption" color="secondary" style={styles.bodyMatch}>
                                            {suggestion.bodyMatch ? `Contains: ${suggestion.bodyMatch}` : 'No body filter'}
                                        </AppText>
                                        <AppText variant="caption" color="secondary">
                                            {suggestion.sourceAccountName} → {suggestion.categoryAccountName}
                                        </AppText>
                                        <AppText variant="caption" color="secondary">
                                            Based on {suggestion.sampleCount} imported messages
                                        </AppText>
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => AppNavigation.toSmsRuleForm(undefined, suggestion)}
                                        >
                                            <AppText variant="caption" style={{ color: theme.primary, marginTop: Spacing.sm }}>
                                                Use suggestion
                                            </AppText>
                                        </TouchableOpacity>
                                    </AppCard>
                                ))}
                            </View>
                        )}
                        <EmptyStateView
                            title="No Auto-Post Rules"
                            subtitle="Automatically post journal entries when matching SMS messages are received."
                        />
                    </>
                )}
                renderItem={() => null}
            />
        );
    }

    return (
        <FlatList
            data={rules}
            keyExtractor={r => r.id}
            ListHeaderComponent={suggestions.length > 0 ? (
                <View style={styles.suggestionsSection}>
                    <AppText variant="subheading" style={styles.suggestionsTitle}>Suggested Rules</AppText>
                    {suggestions.map((suggestion) => (
                        <TouchableOpacity
                            key={`${suggestion.senderMatch}-${suggestion.categoryAccountId}`}
                            activeOpacity={0.7}
                            onPress={() => AppNavigation.toSmsRuleForm(undefined, suggestion)}
                        >
                            <AppCard elevation="sm" style={styles.card}>
                                <AppText variant="body" weight="semibold">{suggestion.senderMatch}</AppText>
                                <AppText variant="caption" color="secondary" style={styles.bodyMatch}>
                                    {suggestion.bodyMatch ? `Contains: ${suggestion.bodyMatch}` : 'No body filter'}
                                </AppText>
                                <AppText variant="caption" color="secondary">
                                    {suggestion.sourceAccountName} → {suggestion.categoryAccountName}
                                </AppText>
                                <AppText variant="caption" color="secondary">
                                    Based on {suggestion.sampleCount} imported messages
                                </AppText>
                            </AppCard>
                        </TouchableOpacity>
                    ))}
                </View>
            ) : null}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => AppNavigation.toSmsRuleForm(item.id)}
                >
                    <AppCard elevation="sm" style={styles.card}>
                        <View style={styles.cardHeader}>
                            <AppText variant="subheading" weight="semibold">
                                {getConditions(item).length > 0 ? 'Structured rule' : item.senderMatch}
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
                        <AppText variant="body" color="secondary" style={styles.bodyMatch}>
                            {getConditionSummary(item)}
                        </AppText>
                        <AppText variant="caption" color="secondary">
                            Action: {getActionLabel(item)} | Priority: {item.priority ?? 100}
                        </AppText>
                        {getActionLabel(item) === 'Auto-post' && (!!item.sourceAccountId || !!item.categoryAccountId) ? (
                            <View style={styles.accountsRow}>
                                <AppText variant="caption" color="secondary">
                                    {accountMap.get(item.sourceAccountId) || item.sourceAccountId}
                                </AppText>
                                <AppIcon name="arrowRight" size={14} color={theme.textSecondary} style={{ marginHorizontal: Spacing.xs }} />
                                <AppText variant="caption" color="secondary">
                                    {accountMap.get(item.categoryAccountId) || item.categoryAccountId}
                                </AppText>
                            </View>
                        ) : null}
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
    return (
        <Screen
            title="SMS Auto-Post Rules"
            showBack={true}
            scrollable={false}
        >
            <EnhancedSmsRulesList />
            <FloatingActionButton
                onPress={() => AppNavigation.toSmsRuleForm()}
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
    suggestionsSection: {
        marginBottom: Spacing.md,
    },
    suggestionsTitle: {
        marginBottom: Spacing.sm,
    },
});
