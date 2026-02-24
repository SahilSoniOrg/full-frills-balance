import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { insightService, Pattern } from '@/src/services/insight-service';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function DismissedInsightsScreen() {
    const { theme } = useTheme();
    const [dismissedPatterns, setDismissedPatterns] = useState<Pattern[]>([]);

    useEffect(() => {
        const subscription = insightService.observeDismissedPatterns().subscribe(setDismissedPatterns);
        return () => subscription.unsubscribe();
    }, []);

    const handleRestore = async (id: string) => {
        await insightService.undismissPattern(id);
    };

    const renderItem = ({ item }: { item: Pattern }) => (
        <View style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.border }]}>
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
                    {AppConfig.strings.dashboard.restore}
                </AppText>
            </TouchableOpacity>
        </View>
    );

    return (
        <Screen title={AppConfig.strings.dashboard.dismissedInsightsTitle} withPadding scrollable={false}>
            {dismissedPatterns.length === 0 ? (
                <View style={styles.empty}>
                    <AppIcon name="info" size={Size.lg} color={theme.textTertiary} />
                    <AppText variant="body" color="secondary" style={styles.emptyText}>
                        {AppConfig.strings.dashboard.noDismissedInsights}
                    </AppText>
                </View>
            ) : (
                <FlatList
                    data={dismissedPatterns}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                />
            )}
        </Screen>
    );
}

const styles = StyleSheet.create({
    list: {
        paddingVertical: Spacing.md,
    },
    item: {
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
