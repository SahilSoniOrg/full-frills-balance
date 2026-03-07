import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { FormScreenWrapper } from '@/src/components/common/FormScreenWrapper';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { AppCard, AppInput, AppText, IconName, IvyIcon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { AccountSubtypeSelector } from '@/src/features/accounts/components/AccountSubtypeSelector';
import { AccountTypeSelector } from '@/src/features/accounts/components/AccountTypeSelector';
import { CurrencySelector } from '@/src/features/accounts/components/CurrencySelector';
import { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { IconPickerModal } from '@/src/features/onboarding';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountMetadataSection } from './metadata/AccountMetadataSection';

export function AccountFormView(vm: AccountFormViewModel) {
    const { theme, fonts } = useTheme();
    const {
        heroTitle,
        heroSubtitle,
        isEditMode,
        accountName,
        setAccountName,
        accountType,
        setAccountType,
        accountSubtype,
        setAccountSubtype,
        selectedCurrency,
        currencies,
        setSelectedCurrency,
        selectedIcon,
        setSelectedIcon,
        isIconPickerVisible,
        setIsIconPickerVisible,
        initialBalance,
        onInitialBalanceChange,
        formError,
        onSave,
        saveLabel,
        currencyLabel,
        showInitialBalance,
        isSaveDisabled,
        parentAccountId,
        parentAccountName,
        setParentAccountId,
        potentialParents,
        isParent,
        showCurrency,
        isParentPickerVisible,
        setIsParentPickerVisible,
        statementDay,
        setStatementDay,
        dueDay,
        setDueDay,
        creditLimitAmount,
        setCreditLimitAmount,
        apr,
        setApr,
        emiDay,
        setEmiDay,
        loanTenureMonths,
        setLoanTenureMonths,
        minimumPaymentAmount,
        setMinimumPaymentAmount,
        notes,
        setNotes,
    } = vm;

    return (
        <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
            <FormScreenWrapper
                contentContainerStyle={styles.content}
                footerSlot={
                    <SubmitFooter
                        onPress={onSave}
                        label={saveLabel}
                        disabled={isSaveDisabled}
                    />
                }
            >
                <AppText variant="heading" style={[styles.title, { fontFamily: fonts.bold, color: theme.text }]}>
                    {heroTitle}
                </AppText>
                <AppText variant="body" color="secondary" style={[styles.subtitle, { color: theme.textSecondary }]}>
                    {heroSubtitle}
                </AppText>

                {formError && (
                    <View style={[styles.errorContainer, { backgroundColor: withOpacity(theme.error, Opacity.soft), borderColor: theme.error }]}
                    >
                        <AppText variant="body" style={{ color: theme.error }}>{formError}</AppText>
                    </View>
                )}

                <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                    <View style={styles.nameRow}>
                        <TouchableOpacity
                            onPress={() => setIsIconPickerVisible(true)}
                            style={styles.iconButton}
                        >
                            <IvyIcon
                                name={selectedIcon as IconName}
                                color={theme.primary}
                                size={Size.iconXl}
                            />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <AppInput
                                label={AppConfig.strings.accounts.form.accountName}
                                value={accountName}
                                onChangeText={setAccountName}
                                placeholder={AppConfig.strings.accounts.form.accountNamePlaceholder}
                                maxLength={AppConfig.input.maxAccountNameLength}
                                returnKeyType="next"
                            />
                        </View>
                    </View>
                </AppCard>
                {(showInitialBalance || showCurrency) && (
                    <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                        <View style={styles.balanceRow}>
                            {showInitialBalance && (
                                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                                    <AppInput
                                        label={isEditMode ? AppConfig.strings.accounts.form.currentBalance : AppConfig.strings.accounts.form.initialBalance}
                                        value={initialBalance}
                                        onChangeText={onInitialBalanceChange}
                                        placeholder={AppConfig.strings.accounts.form.balancePlaceholder}
                                        keyboardType="decimal-pad"
                                        returnKeyType="next"
                                        testID="initial-balance-input"
                                        containerStyle={{ marginBottom: 0 }}
                                    />
                                </View>
                            )}
                            {showCurrency && (
                                <View style={styles.currencyWrapper}>
                                    <AppText variant="body" weight="medium" style={styles.label}>
                                        {currencyLabel}
                                    </AppText>
                                    <CurrencySelector
                                        selectedCurrency={selectedCurrency}
                                        currencies={currencies}
                                        onSelect={setSelectedCurrency}
                                        disabled={isEditMode}
                                        variant="compact"
                                    />
                                </View>
                            )}
                        </View>
                    </AppCard>
                )}

                <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                    <AppText variant="body" style={[styles.label, { fontFamily: fonts.semibold, color: theme.text }]}>
                        {AppConfig.strings.accounts.form.accountType}
                    </AppText>
                    <AccountTypeSelector
                        value={accountType}
                        onChange={setAccountType}
                        disabled={isParent}
                    />
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <AppText variant="body" style={[styles.label, { fontFamily: fonts.semibold, color: theme.text, marginTop: Spacing.md }]}>
                        {AppConfig.strings.accounts.form.accountSubtype}
                    </AppText>
                    <AccountSubtypeSelector
                        accountType={accountType}
                        value={accountSubtype}
                        onChange={setAccountSubtype}
                        disabled={isParent}
                    />
                </AppCard>

                <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                    <AppText variant="body" style={[styles.label, { fontFamily: fonts.semibold }]}>{AppConfig.strings.accounts.form.parentAccount}</AppText>
                    <TouchableOpacity
                        onPress={() => setIsParentPickerVisible(true)}
                        style={[styles.selectorButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
                    >
                        <AppText variant="body" style={{ color: parentAccountId ? theme.text : theme.textSecondary }}>
                            {parentAccountName}
                        </AppText>
                        <View style={styles.selectorActions}>
                            {parentAccountId && (
                                <TouchableOpacity
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        setParentAccountId('');
                                    }}
                                    style={[styles.clearButton, { backgroundColor: withOpacity(theme.text, Opacity.hover) }]}
                                >
                                    <AppText variant="caption" color="secondary">{AppConfig.strings.accounts.form.clear}</AppText>
                                </TouchableOpacity>
                            )}
                            <IvyIcon name="chevronDown" size={Size.iconSm} color={theme.textSecondary} />
                        </View>
                    </TouchableOpacity>
                </AppCard>

                <AccountMetadataSection
                    accountType={accountType}
                    accountSubtype={accountSubtype}
                    statementDay={statementDay}
                    setStatementDay={setStatementDay}
                    dueDay={dueDay}
                    setDueDay={setDueDay}
                    creditLimitAmount={creditLimitAmount}
                    setCreditLimitAmount={setCreditLimitAmount}
                    emiDay={emiDay}
                    setEmiDay={setEmiDay}
                    loanTenureMonths={loanTenureMonths}
                    setLoanTenureMonths={setLoanTenureMonths}
                    minimumPaymentAmount={minimumPaymentAmount}
                    setMinimumPaymentAmount={setMinimumPaymentAmount}
                    apr={apr}
                    setApr={setApr}
                    notes={notes}
                    setNotes={setNotes}
                />

            </FormScreenWrapper>

            <IconPickerModal
                visible={isIconPickerVisible}
                onClose={() => setIsIconPickerVisible(false)}
                onSelect={(icon) => {
                    setSelectedIcon(icon);
                    setIsIconPickerVisible(false);
                }}
                selectedIcon={selectedIcon as any}
            />
            <AccountPickerModal
                visible={isParentPickerVisible}
                accounts={potentialParents}
                selectedId={parentAccountId}
                onClose={() => setIsParentPickerVisible(false)}
                onSelect={(id) => {
                    setParentAccountId(id);
                    setIsParentPickerVisible(false);
                }}
            />
        </SafeAreaView >
    );
}

const styles = StyleSheet.create({
    content: {
        padding: Spacing.lg,
    },
    container: {
        flex: 1,
    },
    title: {
        fontSize: Typography.sizes.xxl,
        textAlign: 'left',
        marginBottom: Spacing.xs,
    },
    subtitle: {
        textAlign: 'left',
        marginBottom: Spacing.lg,
    },
    inputContainer: {
        marginBottom: Spacing.md,
    },
    label: {
        marginBottom: Spacing.xs,
    },
    divider: {
        height: 1,
        marginVertical: Spacing.md,
    },
    errorContainer: {
        padding: Spacing.md,
        borderRadius: Shape.radius.sm,
        borderWidth: 1,
        marginBottom: Spacing.md,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    iconButton: {
        marginTop: Spacing.md,
    },
    selectorButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: Shape.radius.sm,
        borderWidth: 1,
        minHeight: Size.touchTarget,
    },
    selectorActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    clearButton: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: Shape.radius.xs,
    },
    balanceRow: {
        flexDirection: 'row',
        gap: Spacing.md,
        alignItems: 'flex-start',
    },
    currencyWrapper: {
        width: 100,
    },
    metadataSection: {
        marginTop: Spacing.sm,
        marginBottom: Spacing.xl,
    },
    sectionTitle: {
        fontSize: Typography.sizes.sm,
        letterSpacing: 1.5,
        marginLeft: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    metadataRow: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
});
