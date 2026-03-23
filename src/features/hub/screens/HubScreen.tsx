import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { HubWidget } from '@/src/features/hub/components/HubWidget';
import { useHub } from '@/src/features/hub/hooks/useHub';
import { useTheme } from '@/src/hooks/use-theme';
import { Insight } from '@/src/services/notification/NotificationService';
import { AppNavigation } from '@/src/utils/navigation';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type Tab = 'active' | 'dismissed';

export default function HubScreen() {
    const { strings } = AppConfig;
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<Tab>('active');
    const { activeInsights, dismissedInsights, unreadSmsCount, restoreInsight } = useHub();

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
                    {strings.dashboard.hub.activeTab} ({activeInsights.length + (unreadSmsCount > 0 ? 1 : 0)})
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
                    {strings.dashboard.hub.dismissedTab} ({dismissedInsights.length})
                </AppText>
            </TouchableOpacity>
        </View>
    );

    const handleRestore = async (id: string) => {
        await restoreInsight(id);
    };

    const renderSmsNotification = () => {
        if (unreadSmsCount === 0 || activeTab !== 'active') return null;

        return (
            <TouchableOpacity
                onPress={AppNavigation.toSmsInbox}
                style={[styles.smsCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                activeOpacity={0.7}
            >
                <View style={styles.smsIconContainer}>
                    <AppIcon name="notifications" size={Size.md} color={theme.primary} />
                </View>
                <View style={styles.smsContent}>
                    <AppText variant="body" weight="bold">
                        {strings.dashboard.hub.unreadSmsTitle(unreadSmsCount)}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                        {strings.dashboard.hub.unreadSmsSubtitle}
                    </AppText>
                </View>
                <AppIcon name="chevronRight" size={Size.sm} color={theme.textTertiary} />
            </TouchableOpacity>
        );
    };

    return (
        <Screen title={strings.dashboard.hub.title} withPadding={false} scrollable={true}>
            <View style={styles.headerSpacer} />
            {renderTabs()}

            <View style={styles.content}>
                {renderSmsNotification()}

                {activeTab === 'active' ? (
                    activeInsights.length > 0 ? (
                        <HubWidget insights={activeInsights} hideManageDismissed />
                    ) : unreadSmsCount === 0 ? (
                        <View style={styles.empty}>
                            <AppIcon name="info" size={Size.lg} color={theme.textTertiary} />
                            <AppText variant="body" color="secondary" style={styles.emptyText}>
                                {strings.dashboard.hub.emptyState}
                            </AppText>
                        </View>
                    ) : null
                ) : (
                    dismissedInsights.length > 0 ? (
                        <View style={styles.dismissedList}>
                            {dismissedInsights.map((item: Insight) => (
                                <View key={item.id} style={[styles.dismissedItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <View style={styles.itemContent}>
                                        <View style={styles.header}>
                                            <AppIcon
                                                name={item.type === 'subscription-amnesiac' ? 'history' : 'trendingUp'}
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
                                            {strings.dashboard.hub.restore}
                                        </AppText>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={styles.empty}>
                            <AppIcon name="info" size={Size.lg} color={theme.textTertiary} />
                            <AppText variant="body" color="secondary" style={styles.emptyText}>
                                {strings.dashboard.hub.noDismissed}
                            </AppText>
                        </View>
                    )
                )}
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    headerSpacer: {
        height: Spacing.md,
    },
    tabContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        marginBottom: Spacing.md,
        marginHorizontal: Spacing.lg,
    },
    tab: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        marginRight: Spacing.sm,
    },
    content: {
        flex: 1,
        paddingHorizontal: Spacing.lg,
    },
    smsCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: Spacing.md,
    },
    smsIconContainer: {
        marginRight: Spacing.md,
    },
    smsContent: {
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
