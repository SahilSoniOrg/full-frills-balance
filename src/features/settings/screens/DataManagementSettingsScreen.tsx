import { AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Inset, Stack } from '@/src/design-system';

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
        onConfirmExport,
        onImport,
        onAuditLog,
        onFixIntegrity,
        onCleanup,
        onFactoryReset,
        isNamingExport,
        setIsNamingExport,
        exportFilename,
        setExportFilename,
    } = vm;

    return (
        <Screen
            title={AppConfig.strings.settings.sections.dataManagement}
            showBack={true}
            scrollable
        >
            <Inset space="md" vertical="md">
                <Stack space="xl">
                    <SettingsMenu header={AppConfig.strings.settings.sections.dataManagement}>
                        <SettingsMenuItem
                            leftIcon="document"
                            title={AppConfig.strings.settings.data.exportBtn}
                            description={AppConfig.strings.settings.data.exportDesc}
                            onPress={onExport}
                            loading={isExporting}
                        />
                        <SettingsMenuItem
                            leftIcon="refresh"
                            title={AppConfig.strings.settings.data.importBtn}
                            description="Restore your data from a backup file"
                            onPress={onImport}
                            loading={isImporting}
                        />
                        <SettingsMenuItem
                            leftIcon="history"
                            title={AppConfig.strings.settings.data.auditBtn}
                            description={AppConfig.strings.settings.data.auditDesc}
                            onPress={onAuditLog}
                        />
                    </SettingsMenu>

                    <SettingsMenu header={AppConfig.strings.settings.sections.maintenance}>
                        <SettingsMenuItem
                            leftIcon="search"
                            title={AppConfig.strings.settings.maintenance.integrityBtn}
                            description={AppConfig.strings.settings.maintenance.integrityDesc}
                            onPress={onFixIntegrity}
                            loading={isMaintenanceMode}
                        />
                        <SettingsMenuItem
                            leftIcon="delete"
                            title={AppConfig.strings.settings.danger.cleanupBtn}
                            description={AppConfig.strings.settings.danger.cleanupDesc}
                            onPress={onCleanup}
                            loading={isCleaning}
                        />
                    </SettingsMenu>

                    <SettingsMenu header={AppConfig.strings.settings.sections.dangerZone}>
                        <SettingsMenuItem
                            leftIcon="alert"
                            title={AppConfig.strings.settings.danger.resetBtn}
                            description={AppConfig.strings.settings.danger.resetDesc}
                            onPress={onFactoryReset}
                            loading={isResetting}
                            danger
                        />
                    </SettingsMenu>
                </Stack>
            </Inset>

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
                            <AppIcon name="search" size={40} color={theme.primary} />
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

            {/* Export Naming Modal */}
            <Modal
                visible={isNamingExport}
                transparent
                animationType="slide"
                statusBarTranslucent
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
                        <View style={styles.modalIconRow}>
                            <AppIcon name="document" size={40} color={theme.primary} />
                        </View>

                        <AppText variant="subheading" style={styles.modalTitle}>
                            {AppConfig.strings.settings.data.exportFilenameLabel}
                        </AppText>

                        <AppInput
                            label={AppConfig.strings.settings.data.exportFilenameLabel}
                            placeholder={AppConfig.strings.settings.data.exportFilenamePlaceholder}
                            value={exportFilename}
                            onChangeText={setExportFilename}
                            containerStyle={{ width: '100%', marginBottom: Spacing.xl }}
                            leftIcon="document"
                            autoFocus
                        />

                        <View style={styles.modalActionRow}>
                            <AppButton
                                variant="outline"
                                onPress={() => setIsNamingExport(false)}
                                style={{ flex: 1, marginRight: Spacing.sm }}
                            >
                                {AppConfig.strings.common.cancel}
                            </AppButton>
                            <AppButton
                                variant="primary"
                                onPress={onConfirmExport}
                                loading={isExporting}
                                style={{ flex: 2 }}
                            >
                                {AppConfig.strings.settings.data.exportBtn}
                            </AppButton>
                        </View>
                    </View>
                </View>
            </Modal>
        </Screen>
    );
}

const styles = StyleSheet.create({
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
    modalActionRow: {
        flexDirection: 'row',
        width: '100%',
        alignItems: 'center',
    },
});
