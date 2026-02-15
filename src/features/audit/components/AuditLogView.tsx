import { AppIcon, EmptyStateView, LoadingView } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { AuditLogItem } from '@/src/features/audit/components/AuditLogItem';
import { AuditLogViewModel } from '@/src/features/audit/hooks/useAuditLogViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

export function AuditLogView(vm: AuditLogViewModel) {
    const { theme } = useTheme();
    const {
        logs,
        accountMap,
        isLoading,
        isFiltered,
        expandedIds,
        onToggleExpanded,
    } = vm;

    return (
        <Screen
            title={isFiltered ? AppConfig.strings.audit.editHistory : AppConfig.strings.audit.logTitle}
        >
            <View style={styles.viewContent}>
                {isLoading ? (
                    <LoadingView loading={isLoading} />
                ) : logs.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <AppIcon name="document" size={Size.fab} color={theme.textSecondary} />
                        <EmptyStateView title={AppConfig.strings.audit.emptyLogs} style={styles.emptyStateText} />
                    </View>
                ) : (
                    <FlatList
                        data={logs}
                        renderItem={({ item }) => (
                            <AuditLogItem
                                item={item}
                                isExpanded={expandedIds.has(item.id)}
                                onToggle={() => onToggleExpanded(item.id)}
                                accountMap={accountMap}
                            />
                        )}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    viewContent: {
        flex: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.md,
    },
    emptyStateText: {
        flex: 0,
        paddingTop: 0,
    },
    list: {
        padding: Spacing.md,
    },
});
