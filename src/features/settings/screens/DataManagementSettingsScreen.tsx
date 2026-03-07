import { AppButton, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { SettingsSection } from '@/src/features/settings/components/SettingsSection';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

export default function DataManagementSettingsScreen() {
    const vm = useSettingsViewModel();
    const { theme } = useTheme();

    const {
        isExporting,
        isImporting,
        isMaintenanceMode,
        integrityProgress,
        integrityProgressMessage,
        isCleaning,
        isResetting,
        onExport,
        onImport,
        onAuditLog,
        onFixIntegrity,
        onCleanup,
        onFactoryReset,
    } = vm;

    return (
        <Screen
            title={AppConfig.strings.settings.sections.dataManagement}
            showBack={true}
            scrollable
            withPadding
        >
            <View style={styles.container}>
                <SettingsSection title={AppConfig.strings.settings.sections.dataManagement}>
                    <AppText variant="body" style={styles.cardDesc}>
                        {AppConfig.strings.settings.data.exportDesc}
                    </AppText>
                    <AppButton
                        variant="outline"
                        onPress={onExport}
                        loading={isExporting}
                    >
                        {AppConfig.strings.settings.data.exportBtn}
                    </AppButton>

                    <AppButton
                        variant="outline"
                        onPress={onImport}
                        loading={isImporting}
                        style={{ marginTop: Spacing.sm }}
                    >
                        {AppConfig.strings.settings.data.importBtn}
                    </AppButton>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    <AppText variant="body" style={styles.cardDesc}>
                        {AppConfig.strings.settings.data.auditDesc}
                    </AppText>
                    <AppButton
                        variant="outline"
                        onPress={onAuditLog}
                    >
                        {AppConfig.strings.settings.data.auditBtn}
                    </AppButton>
                </SettingsSection>

                <SettingsSection title={AppConfig.strings.settings.sections.maintenance}>
                    <AppText variant="body" style={styles.cardDesc}>
                        {AppConfig.strings.settings.maintenance.integrityDesc}
                    </AppText>
                    <AppButton
                        variant="secondary"
                        onPress={onFixIntegrity}
                        loading={isMaintenanceMode}
                    >
                        {AppConfig.strings.settings.maintenance.integrityBtn}
                    </AppButton>
                </SettingsSection>

                <SettingsSection
                    title={AppConfig.strings.settings.sections.dangerZone}
                    danger
                >
                    <AppText variant="body" style={styles.cardDesc}>
                        {AppConfig.strings.settings.danger.cleanupDesc}
                    </AppText>
                    <AppButton
                        variant="outline"
                        onPress={onCleanup}
                        style={{ borderColor: theme.error }}
                        loading={isCleaning}
                    >
                        {AppConfig.strings.settings.danger.cleanupBtn}
                    </AppButton>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    <AppText variant="body" style={styles.cardDesc}>
                        {AppConfig.strings.settings.danger.resetDesc}
                    </AppText>
                    <AppButton
                        variant="primary"
                        onPress={onFactoryReset}
                        style={{ backgroundColor: theme.error }}
                        loading={isResetting}
                    >
                        {AppConfig.strings.settings.danger.resetBtn}
                    </AppButton>
                </SettingsSection>
            </View>

            {/* Blocking integrity check progress modal */}
            <Modal
                visible={isMaintenanceMode}
                transparent
                animationType="fade"
                statusBarTranslucent
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
                        <View style={styles.modalIconRow}>
                            <AppText variant="heading" style={{ fontSize: 40 }}>🔍</AppText>
                        </View>

                        <AppText variant="subheading" style={styles.modalTitle}>
                            {AppConfig.strings.settings.maintenance.integrityTitle}
                        </AppText>

                        <View style={[styles.progressBarBg, { backgroundColor: theme.surfaceSecondary }]}>
                            <View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        backgroundColor: theme.primary,
                                        width: `${Math.max(2, Math.min(100, integrityProgress * 100))}%`,
                                    },
                                ]}
                            />
                        </View>

                        <AppText variant="body" color="secondary" style={styles.modalStatus}>
                            {integrityProgressMessage || AppConfig.strings.settings.maintenance.integrityWait}
                        </AppText>

                        <AppText variant="caption" color="secondary" style={styles.modalHint}>
                            {AppConfig.strings.settings.maintenance.integrityHint}
                        </AppText>
                    </View>
                </View>
            </Modal>
        </Screen>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: Spacing.xl,
    },
    cardDesc: {
        marginBottom: Spacing.md,
    },
    divider: {
        height: 1,
        marginVertical: Spacing.lg,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
    },
    modalCard: {
        width: '100%',
        borderRadius: 16,
        padding: Spacing.xl,
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    modalIconRow: {
        marginBottom: Spacing.md,
    },
    modalTitle: {
        marginBottom: Spacing.lg,
        textAlign: 'center',
    },
    progressBarBg: {
        width: '100%',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: Spacing.md,
    },
    progressBarFill: {
        height: '100%',
    },
    modalStatus: {
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    modalHint: {
        textAlign: 'center',
        opacity: 0.6,
        marginTop: Spacing.md,
    },
});
