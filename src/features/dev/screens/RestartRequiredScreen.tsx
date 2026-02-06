import { AppButton, AppCard, AppText, IvyIcon, Stack } from '@/src/components/core';
import { Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { logger } from '@/src/utils/logger';
import * as Updates from 'expo-updates';
import React, { useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * RestartRequiredScreen - Blocking UI shown after sensitive operations (Factory Reset, Import)
 * This screen ensures the app state is cleanly reloaded.
 */
export const RestartRequiredScreen = () => {
    const { theme } = useTheme();
    const { restartType, importStats } = useUI();

    const handleRestart = useCallback(async () => {
        if (Platform.OS === 'web') {
            window.location.reload();
        } else {
            try {
                await Updates.reloadAsync();
            } catch (e) {
                // Fallback if expo-updates isn't available/configured
                logger.error('Failed to reload app', e);
            }
        }
    }, []);

    const isImport = restartType === 'IMPORT';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.content}>
                <View style={[styles.iconContainer, { backgroundColor: isImport ? withOpacity(theme.success, Opacity.soft) : withOpacity(theme.error, Opacity.soft) }]}>
                    <IvyIcon
                        name={isImport ? 'checkCircle' : 'delete'}
                        size={48}
                        color={isImport ? theme.success : theme.error}
                    />
                </View>

                <AppText variant="title" align="center" style={styles.title}>
                    {isImport ? 'Import Successful' : 'Factory Reset Complete'}
                </AppText>

                <AppText variant="body" color="secondary" align="center" style={styles.description}>
                    {isImport
                        ? 'Your data has been successfully imported into the local database.'
                        : 'All data, accounts, and settings have been permanently erased.'}
                </AppText>

                {isImport && importStats && (
                    <AppCard padding="lg" elevation="sm" style={styles.statsCard}>
                        <Stack gap="md">
                            <View style={styles.statRow}>
                                <AppText variant="body" weight="medium">Accounts</AppText>
                                <AppText variant="body" color="success" weight="bold">{importStats.accounts}</AppText>
                            </View>
                            <View style={styles.statRow}>
                                <AppText variant="body" weight="medium">Journals</AppText>
                                <AppText variant="body" color="success" weight="bold">{importStats.journals}</AppText>
                            </View>
                            <View style={styles.statRow}>
                                <AppText variant="body" weight="medium">Transactions</AppText>
                                <AppText variant="body" color="success" weight="bold">{importStats.transactions}</AppText>
                            </View>
                            {typeof importStats.auditLogs === 'number' && importStats.auditLogs > 0 && (
                                <View style={styles.statRow}>
                                    <AppText variant="body" weight="medium">Audit Logs</AppText>
                                    <AppText variant="body" color="success" weight="bold">{importStats.auditLogs}</AppText>
                                </View>
                            )}
                            {importStats.skippedTransactions > 0 && (
                                <View style={styles.statRow}>
                                    <AppText variant="body" color="warning">Skipped Items</AppText>
                                    <AppText variant="body" color="warning" weight="bold">{importStats.skippedTransactions}</AppText>
                                </View>
                            )}
                        </Stack>
                    </AppCard>
                )}

                <View style={styles.footer}>
                    <AppText variant="caption" color="secondary" align="center" style={styles.restartNote}>
                        A restart is required to finalize changes and re-initialize the application engine.
                    </AppText>
                    <AppButton
                        variant="outline"
                        size="md"
                        onPress={handleRestart}
                        style={styles.restartButton}
                    >
                        Restart App
                    </AppButton>
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    iconContainer: {
        width: Size.avatarXl,
        height: Size.avatarXl,
        borderRadius: Size.avatarXl / 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    title: {
        marginBottom: Spacing.sm,
    },
    description: {
        marginBottom: Spacing.xl,
        maxWidth: 300,
    },
    statsCard: {
        width: '100%',
        maxWidth: 340,
        marginBottom: Spacing.xl,
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footer: {
        width: '100%',
        marginTop: 'auto',
    },
    restartNote: {
        marginBottom: Spacing.md,
    },
    restartButton: {
        width: '100%',
        marginTop: Spacing.sm,
    },
});
