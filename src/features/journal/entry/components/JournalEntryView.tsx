import { AppText, Badge } from '@/src/components/core';
import { Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { AccountSelector } from '@/src/features/journal/components/AccountSelector';
import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import { JournalModeToggle } from '@/src/features/journal/entry/components/JournalModeToggle';
import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { JournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function JournalEntryView(vm: JournalEntryViewModel) {
    const {
        theme,
        isLoading,
        headerTitle,
        showEditBanner,
        editBannerText,
        isGuidedMode,
        onToggleGuidedMode,
        showAccountPicker,
        onCloseAccountPicker,
        onAccountSelected,
        simpleFormProps,
        advancedFormProps,
        accounts,
    } = vm;

    if (isLoading) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}
            >
                <View style={styles.loadingContainer}>
                    <AppText variant="body">Loading...</AppText>
                </View>
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <JournalEntryHeader title={headerTitle} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    {showEditBanner && (
                        <View style={[styles.editBanner, { backgroundColor: withOpacity(theme.warning, Opacity.soft) }]}
                        >
                            <Badge variant="expense" size="sm">EDITING</Badge>
                            <AppText variant="caption" color="secondary" style={{ marginLeft: Spacing.sm }}>
                                {editBannerText}
                            </AppText>
                        </View>
                    )}

                    <JournalModeToggle
                        isGuidedMode={isGuidedMode}
                        setIsGuidedMode={onToggleGuidedMode}
                    />

                    {isGuidedMode ? (
                        <SimpleForm {...simpleFormProps} />
                    ) : (
                        <AdvancedForm {...advancedFormProps} />
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            <AccountSelector
                visible={showAccountPicker}
                accounts={accounts}
                selectedId={vm.selectedAccountId}
                onClose={onCloseAccountPicker}
                onSelect={onAccountSelected}
            />
        </SafeAreaView>
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
