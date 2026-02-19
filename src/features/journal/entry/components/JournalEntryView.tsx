import { AppConfig, Spacing } from '@/src/constants';
import { AccountSelector } from '@/src/features/journal/components/AccountSelector';
import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import { JournalMetaCard } from '@/src/features/journal/entry/components/JournalMetaCard';
import { JournalModeToggle } from '@/src/features/journal/entry/components/JournalModeToggle';
import { JournalSubmitFooter } from '@/src/features/journal/entry/components/JournalSubmitFooter';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
import { JournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
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
    } = vm;

    if (isLoading) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}
            >
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.primary} />
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
                        isSimpleDisabled={vm.isSimpleModeDisabled}
                    />
                }
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >

                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    <JournalMetaCard
                        date={vm.editor.journalDate}
                        setDate={vm.editor.setJournalDate}
                        time={vm.editor.journalTime}
                        setTime={vm.editor.setJournalTime}
                        description={vm.editor.description}
                        setDescription={vm.editor.setDescription}
                        style={{ marginHorizontal: Spacing.lg }}
                        showBanner={showEditBanner}
                        bannerText={editBannerText}
                    />
                    {isGuidedMode ? (
                        <SimpleForm {...vm.simpleEditor} />
                    ) : (
                        <>
                            <AdvancedForm
                                accounts={vm.accounts}
                                editor={vm.editor}
                                onSelectAccountRequest={vm.advancedFormConfig.onSelectAccountRequest}
                            />
                            <JournalSummary
                                totalDebits={vm.totalDebits}
                                totalCredits={vm.totalCredits}
                                isBalanced={vm.isBalanced}
                                availableCurrencies={vm.availableCurrencies}
                                selectedCurrency={vm.selectedCurrency}
                                onSelectCurrency={vm.onSelectCurrency}
                            />
                        </>
                    )}
                </ScrollView>

                <JournalSubmitFooter
                    onPress={isGuidedMode ? vm.simpleEditor.handleSave : vm.editor.submit}
                    disabled={isGuidedMode ? !vm.simpleFormIsValid : !vm.advancedFormIsValid}
                    label={isGuidedMode
                        ? (vm.simpleEditor.isSubmitting ? AppConfig.strings.transactionFlow.saving : AppConfig.strings.transactionFlow.save(vm.simpleEditor.type))
                        : (vm.editor.isSubmitting
                            ? (vm.editor.isEdit ? AppConfig.strings.advancedEntry.updating : AppConfig.strings.advancedEntry.creating)
                            : (vm.editor.isEdit ? AppConfig.strings.advancedEntry.updateJournal : AppConfig.strings.advancedEntry.createJournal))
                    }
                    topSlot={
                        <SimpleFormAmountInput
                            amount={vm.primaryDisplayAmount}
                            setAmount={vm.simpleEditor.setAmount}
                            readOnly={!isGuidedMode}
                            activeColor={isGuidedMode
                                ? (vm.simpleEditor.type === 'expense' ? theme.expense : vm.simpleEditor.type === 'income' ? theme.income : theme.primary)
                                : (vm.isBalanced ? theme.success : theme.error)
                            }
                            displayCurrency={vm.primaryDisplayCurrency}
                        />
                    }
                />
            </KeyboardAvoidingView>

            <AccountSelector
                visible={vm.showAccountPicker}
                accounts={vm.accounts}
                selectedId={vm.selectedAccountId}
                onClose={vm.onCloseAccountPicker}
                onSelect={vm.onAccountSelected}
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
});
