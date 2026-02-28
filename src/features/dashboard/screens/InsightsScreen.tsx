import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Size, Spacing } from '@/src/constants';
import { InsightWidget } from '@/src/features/dashboard/components/InsightWidget';
import { useTheme } from '@/src/hooks/use-theme';
import { insightService, Pattern } from '@/src/services/insight-service';
import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type Tab = 'active' | 'dismissed';

export default function InsightsScreen() {
    const { theme, fonts } = useTheme();
    const [activeTab, setActiveTab] = useState<Tab>('active');
    const [activePatterns, setActivePatterns] = useState<Pattern[]>([]);
    const [dismissedPatterns, setDismissedPatterns] = useState<Pattern[]>([]);

    useEffect(() => {
        const activeSub = insightService.observePatterns().subscribe(setActivePatterns);
        const dismissedSub = insightService.observeDismissedPatterns().subscribe(setDismissedPatterns);
        return () => {
            activeSub.unsubscribe();
            dismissedSub.unsubscribe();
        };
    }, []);

    const renderTabs = () => (
        <View style={[styles.tabContainer, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
                onPress={() => setActiveTab('active')}
                style={[
                    styles.tab,
                    activeTab === 'active' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }
                ]}
            >
                <AppText
                    variant="body"
                    weight={activeTab === 'active' ? 'bold' : 'medium'}
                    style={{ color: activeTab === 'active' ? theme.primary : theme.textSecondary }}
                >
                    Active ({activePatterns.length})
                </AppText>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={() => setActiveTab('dismissed')}
                style={[
                    styles.tab,
                    activeTab === 'dismissed' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }
                ]}
            >
                <AppText
                    variant="body"
                    weight={activeTab === 'dismissed' ? 'bold' : 'medium'}
                    style={{ color: activeTab === 'dismissed' ? theme.primary : theme.textSecondary }}
                >
                    Dismissed ({dismissedPatterns.length})
                </AppText>
            </TouchableOpacity>
        </View>
    );

    const handleRestore = async (id: string) => {
        await insightService.undismissPattern(id);
    };

    return (
        <Screen title="Insights" withPadding scrollable={true}>
            {renderTabs()}

            <View style={styles.content}>
                {activeTab === 'active' ? (
                    activePatterns.length > 0 ? (
                        <InsightWidget patterns={activePatterns} hideManageDismissed />
                    ) : (
                        <View style={styles.empty}>
                            <AppIcon name="info" size={Size.lg} color={theme.textTertiary} />
                            <AppText variant="body" color="secondary" style={styles.emptyText}>
                                No active insights. You're all caught up!
                            </AppText>
                        </View>
                    )
                ) : (
                    dismissedPatterns.length > 0 ? (
                        <View style={styles.dismissedList}>
                            {dismissedPatterns.map(item => (
                                <View key={item.id} style={[styles.dismissedItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <View style={styles.itemContent}>
                                        <View style={styles.header}>
                                            <AppIcon
                                                name={item.type === 'subscription-amnesiac' ? 'repeat' : 'trendingUp'}
                                                size={Size.xs}
                                                color={theme.text}
                                            />
                                            <AppText variant="body" weight="bold" style={{ flex: 1, marginLeft: Spacing.xs }}>
                                                {item.message}
                                            </AppText>
                                        </View>
                                        <AppText variant="caption" color="secondary" style={styles.description}>
                                            {item.description}
                                        </AppText>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => handleRestore(item.id)}
                                        style={[styles.restoreBtn, { backgroundColor: theme.primary }]}
                                    >
                                        <AppText variant="caption" weight="semibold" style={{ color: theme.onPrimary }}>
                                            Restore
                                        </AppText>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={styles.empty}>
                            <AppIcon name="info" size={Size.lg} color={theme.textTertiary} />
                            <AppText variant="body" color="secondary" style={styles.emptyText}>
                                No dismissed insights.
                            </AppText>
                        </View>
                    )
                )}
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    tabContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        marginBottom: Spacing.md,
    },
    tab: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        marginRight: Spacing.sm,
    },
    content: {
        flex: 1,
    },
    dismissedList: {
        paddingVertical: Spacing.sm,
    },
    dismissedItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: Spacing.sm,
    },
    itemContent: {
        flex: 1,
        marginRight: Spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    description: {
        marginLeft: Size.xs + Spacing.xs,
    },
    restoreBtn: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: 20,
    },
    empty: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: Spacing.xl * 2,
    },
    emptyText: {
        marginTop: Spacing.md,
    },
});
