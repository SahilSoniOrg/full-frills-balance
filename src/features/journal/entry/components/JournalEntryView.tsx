import { AppText, Badge } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { AccountSelector } from '@/src/features/journal/components/AccountSelector';
import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import { JournalModeToggle } from '@/src/features/journal/entry/components/JournalModeToggle';
import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { JournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function JournalEntryView(vm: JournalEntryViewModel) {
    const { theme } = useTheme();
    const {
        isLoading,
        headerTitle,
        showEditBanner,
        editBannerText,
        isGuidedMode,
        onToggleGuidedMode,
        showAccountPicker,
        onCloseAccountPicker,
        onAccountSelected,
        simpleFormConfig,
        advancedFormConfig,
        accounts,
    } = vm;

    if (isLoading) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}
            >
                <View style={styles.loadingContainer}>
                    <AppText variant="body">{AppConfig.strings.common.loading || 'Loading...'}</AppText>
                </View>
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <JournalEntryHeader
                title={headerTitle}
                rightSlot={
                    <JournalModeToggle
                        isGuidedMode={isGuidedMode}
                        setIsGuidedMode={onToggleGuidedMode}
                        variant="compact"
                    />
                }
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                {isGuidedMode ? (
                    <View style={styles.content}>
                        {showEditBanner && (
                            <View style={[styles.editBanner, { backgroundColor: withOpacity(theme.warning, Opacity.soft) }]}
                            >
                                <Badge variant="expense" size="sm">{AppConfig.strings.advancedEntry.editing || 'EDITING'}</Badge>
                                <AppText variant="caption" color="secondary" style={{ marginLeft: Spacing.sm }}>
                                    {editBannerText}
                                </AppText>
                            </View>
                        )}
                        <SimpleForm {...simpleFormConfig} />
                    </View>
                ) : (
                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {showEditBanner && (
                            <View style={[styles.editBanner, { backgroundColor: withOpacity(theme.warning, Opacity.soft) }]}
                            >
                                <Badge variant="expense" size="sm">{AppConfig.strings.advancedEntry.editing || 'EDITING'}</Badge>
                                <AppText variant="caption" color="secondary" style={{ marginLeft: Spacing.sm }}>
                                    {editBannerText}
                                </AppText>
                            </View>
                        )}
                        <AdvancedForm {...advancedFormConfig} />
                    </ScrollView>
                )}
            </KeyboardAvoidingView>

            <AccountSelector
                visible={showAccountPicker}
                accounts={accounts}
                selectedId={vm.selectedAccountId}
                onClose={onCloseAccountPicker}
                onSelect={onAccountSelected}
            />
        </SafeAreaView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    editBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.sm,
        borderRadius: Shape.radius.sm,
    },
});
