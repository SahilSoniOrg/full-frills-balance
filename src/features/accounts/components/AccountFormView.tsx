import { AppButton, AppCard, AppInput, AppText, IconName, IvyIcon } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { AccountTypeSelector } from '@/src/features/accounts/components/AccountTypeSelector';
import { CurrencySelector } from '@/src/features/accounts/components/CurrencySelector';
import { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { AccountSelector } from '@/src/features/journal/components/AccountSelector';
import { IconPickerModal } from '@/src/features/onboarding/components/IconPickerModal';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function AccountFormView(vm: AccountFormViewModel) {
    const { fonts } = useTheme();
    const insets = useSafeAreaInsets();
    const {
        theme,
        title,
        heroTitle,
        heroSubtitle,
        isEditMode,
        accountName,
        setAccountName,
        accountType,
        setAccountType,
        selectedCurrency,
        setSelectedCurrency,
        selectedIcon,
        setSelectedIcon,
        isIconPickerVisible,
        setIsIconPickerVisible,
        initialBalance,
        onInitialBalanceChange,
        formError,
        onCancel,
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
    } = vm;

    return (
        <Screen
            title={title}
            onBack={onCancel}
            edges={['top', 'bottom']}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    <AppText variant="heading" style={[styles.title, { fontFamily: fonts.bold }]}>
                        {heroTitle}
                    </AppText>
                    <AppText variant="body" color="secondary" style={styles.subtitle}>
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
                                    autoFocus
                                    maxLength={AppConfig.input.maxAccountNameLength}
                                    returnKeyType="next"
                                />
                            </View>
                        </View>
                    </AppCard>



                    {showInitialBalance && (
                        <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                            <AppInput
                                label={isEditMode ? AppConfig.strings.accounts.form.currentBalance : AppConfig.strings.accounts.form.initialBalance}
                                value={initialBalance}
                                onChangeText={onInitialBalanceChange}
                                placeholder={AppConfig.strings.accounts.form.balancePlaceholder}
                                keyboardType="decimal-pad"
                                returnKeyType="next"
                                testID="initial-balance-input"
                            />
                        </AppCard>
                    )}

                    <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                        <AppText variant="body" style={[styles.label, { fontFamily: fonts.semibold }]}>{AppConfig.strings.accounts.form.accountType}</AppText>
                        <AccountTypeSelector
                            value={accountType}
                            onChange={setAccountType}
                            disabled={isParent}
                        />
                    </AppCard>

                    {showCurrency && (
                        <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                            <AppText variant="body" style={[styles.label, { fontFamily: fonts.semibold }]}>{currencyLabel}</AppText>
                            <CurrencySelector
                                selectedCurrency={selectedCurrency}
                                onSelect={setSelectedCurrency}
                                disabled={isEditMode}
                            />
                        </AppCard>
                    )}

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
                                        style={styles.clearButton}
                                    >
                                        <AppText variant="caption" color="secondary">{AppConfig.strings.accounts.form.clear}</AppText>
                                    </TouchableOpacity>
                                )}
                                <IvyIcon name="chevronDown" size={Size.iconSm} color={theme.textSecondary} />
                            </View>
                        </TouchableOpacity>
                    </AppCard>

                </ScrollView>
                <View style={[
                    styles.footer,
                    {
                        backgroundColor: theme.background,
                        borderTopColor: theme.border,
                        paddingBottom: Math.max(Spacing.lg, insets.bottom + Spacing.md)
                    }
                ]}>
                    <AppButton
                        variant="primary"
                        size="lg"
                        onPress={onSave}
                        disabled={isSaveDisabled}
                        style={styles.createButton}
                        testID="save-button"
                    >
                        {saveLabel}
                    </AppButton>
                </View>
            </KeyboardAvoidingView>

            <IconPickerModal
                visible={isIconPickerVisible}
                onClose={() => setIsIconPickerVisible(false)}
                onSelect={(icon) => {
                    setSelectedIcon(icon);
                    setIsIconPickerVisible(false);
                }}
                selectedIcon={selectedIcon as any}
            />
            <AccountSelector
                visible={isParentPickerVisible}
                accounts={potentialParents}
                selectedId={parentAccountId}
                onClose={() => setIsParentPickerVisible(false)}
                onSelect={(id) => {
                    setParentAccountId(id);
                    setIsParentPickerVisible(false);
                }}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        padding: Spacing.lg,
    },
    title: {
        fontSize: Typography.sizes.xxl,
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    subtitle: {
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    inputContainer: {
        marginBottom: Spacing.lg,
    },
    label: {
        marginBottom: Spacing.sm,
        // dynamic font
    },
    footer: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
    },
    createButton: {
        height: Size.buttonXl,
        borderRadius: Shape.radius.r4,
    },
    errorContainer: {
        padding: Spacing.md,
        borderRadius: Shape.radius.sm,
        borderWidth: 1,
        marginBottom: Spacing.lg,
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
        backgroundColor: withOpacity('#000000', Opacity.hover),
    },
});
