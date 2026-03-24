import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { AppConfig, Spacing } from '@/src/constants';
import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import { JournalMetaCard } from '@/src/features/journal/entry/components/JournalMetaCard';
import { JournalModeToggle } from '@/src/features/journal/entry/components/JournalModeToggle';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
import { JournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import { Page } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';

export function JournalEntryView(vm: JournalEntryViewModel) {
    const { theme } = useTheme();
    const [isAmountFocused, setIsAmountFocused] = useState(false);
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
            <Page
                header={
                    <JournalEntryHeader
                        title={headerTitle}
                    />
                }
            >
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            </Page>
        );
    }


    return (
        <Page
            keyboardAvoiding
            scrollable
            header={
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
            }
            footer={
                <SubmitFooter
                    onPress={
                        isGuidedMode 
                            ? (isAmountFocused && !vm.simpleFormIsValid 
                                ? () => Keyboard.dismiss() 
                                : vm.simpleEditor.handleSave) 
                            : vm.editor.submit
                    }
                    disabled={
                        isGuidedMode 
                            ? (isAmountFocused ? false : !vm.simpleFormIsValid) 
                            : !vm.advancedFormIsValid
                    }
                    label={isGuidedMode
                        ? (isAmountFocused && !vm.simpleFormIsValid
                            ? AppConfig.strings.transactionFlow.continue
                            : (vm.simpleEditor.isSubmitting 
                                ? AppConfig.strings.transactionFlow.saving 
                                : AppConfig.strings.transactionFlow.save(vm.simpleEditor.type)))
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
                            onFocus={() => setIsAmountFocused(true)}
                            onBlur={() => setIsAmountFocused(false)}
                        />
                    }
                />
            }
        >
            <JournalMetaCard
                date={vm.editor.journalDate}
                setDate={vm.editor.setJournalDate}
                time={vm.editor.journalTime}
                setTime={vm.editor.setJournalTime}
                description={vm.editor.description}
                setDescription={vm.editor.setDescription}
                style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}
                showBanner={showEditBanner}
                bannerText={editBannerText}
            />

            {isGuidedMode ? (
                <SimpleForm {...vm.simpleEditor} />
            ) : (
                <View style={{ paddingHorizontal: Spacing.lg }}>
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
                </View>
            )}

            <AccountPickerModal
                visible={vm.showAccountPicker}
                accounts={vm.accounts}
                selectedId={vm.selectedAccountId}
                onClose={vm.onCloseAccountPicker}
                onSelect={vm.onAccountSelected}
            />
        </Page>
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
    },
});
