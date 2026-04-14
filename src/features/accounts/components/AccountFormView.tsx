import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { FormSelectorField } from '@/src/components/common/FormSelectorField';
import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { AppInput, AppText, IconName, IvyIcon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { Box, Inset, Separator } from '@/src/design-system';
import { AccountSubtypeSelector } from '@/src/features/accounts/components/AccountSubtypeSelector';
import { AccountTypeSelector } from '@/src/features/accounts/components/AccountTypeSelector';
import { CurrencySelector } from '@/src/features/accounts/components/CurrencySelector';
import { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AccountMetadataSection } from './metadata/AccountMetadataSection';

export function AccountFormView(vm: AccountFormViewModel) {
  const { theme, fonts } = useTheme();
  const {
    heroTitle,
    heroSubtitle,
    isLoading,
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
    onBack,
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
    payFromAccountOptions,
    metadata,
  } = vm;

  const {
    isPayFromPickerVisible,
    setIsPayFromPickerVisible,
    payFromAccountId,
    setPayFromAccountId,
  } = metadata;

  return (
    <EntityFormScreen
      title={heroTitle}
      onBack={onBack}
      contentContainerStyle={{ paddingBottom: Spacing.lg }}
      submitAction={{
        onPress: onSave,
        label: saveLabel,
        disabled: isSaveDisabled,
      }}
      intro={
        <Inset space="lg">
          <AppText
            variant="body"
            color="secondary"
            style={[styles.subtitle, { color: theme.textSecondary }]}
          >
            {heroSubtitle}
          </AppText>

          {formError ? (
            <View
              style={[
                styles.errorContainer,
                {
                  backgroundColor: withOpacity(theme.error, Opacity.soft),
                  borderColor: theme.error,
                },
              ]}
            >
              <AppText variant="body" style={{ color: theme.error }}>
                {formError}
              </AppText>
            </View>
          ) : null}
        </Inset>
      }
    >
      <Inset space="lg">
        <FormSectionGroup>
          <View style={styles.nameRow}>
            <TouchableOpacity
              onPress={() => setIsIconPickerVisible(true)}
              style={styles.iconButton}
            >
              <IvyIcon name={selectedIcon as IconName} color={theme.primary} size={Size.iconXl} />
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
        </FormSectionGroup>
        {(showInitialBalance || showCurrency) && (
          <FormSectionGroup>
            <View style={styles.balanceRow}>
              {showInitialBalance && (
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <AppInput
                    label={
                      isEditMode
                        ? AppConfig.strings.accounts.form.currentBalance
                        : AppConfig.strings.accounts.form.initialBalance
                    }
                    value={initialBalance}
                    onChangeText={onInitialBalanceChange}
                    placeholder={AppConfig.strings.accounts.form.balancePlaceholder}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                    testID="initial-balance-input"
                    containerStyle={{ marginBottom: 0 }}
                    editable={!isLoading}
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
          </FormSectionGroup>
        )}

        <FormSectionGroup title="Account Type">
          <AppText
            variant="body"
            style={[styles.label, { fontFamily: fonts.semibold, color: theme.text }]}
          >
            {AppConfig.strings.accounts.form.accountType}
          </AppText>
          <AccountTypeSelector value={accountType} onChange={setAccountType} disabled={isParent} />
          <Box marginVertical="md">
            <Separator />
          </Box>
          <AppText
            variant="body"
            style={[styles.label, { fontFamily: fonts.semibold, color: theme.text }]}
          >
            {AppConfig.strings.accounts.form.accountSubtype}
          </AppText>
          <AccountSubtypeSelector
            accountType={accountType}
            value={accountSubtype}
            onChange={setAccountSubtype}
            disabled={isParent}
          />
        </FormSectionGroup>

        <FormSectionGroup title="Hierarchy">
          <FormSelectorField
            label={AppConfig.strings.accounts.form.parentAccount}
            value={parentAccountId ? parentAccountName : ''}
            placeholder={AppConfig.strings.common.none}
            onPress={() => setIsParentPickerVisible(true)}
            onClear={parentAccountId ? () => setParentAccountId('') : undefined}
          />
        </FormSectionGroup>

        <AccountMetadataSection
          accountType={accountType}
          accountSubtype={accountSubtype}
          metadata={metadata}
        />
      </Inset>

      <IconPickerModal
        visible={isIconPickerVisible}
        onClose={() => setIsIconPickerVisible(false)}
        onSelect={icon => {
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
        onSelect={id => {
          setParentAccountId(id);
          setIsParentPickerVisible(false);
        }}
      />
      <AccountPickerModal
        visible={isPayFromPickerVisible}
        accounts={payFromAccountOptions}
        selectedId={payFromAccountId}
        title={AppConfig.strings.accounts.form.selectPaymentAccount}
        onClose={() => setIsPayFromPickerVisible(false)}
        onSelect={id => {
          setPayFromAccountId(id);
          setIsPayFromPickerVisible(false);
        }}
      />
    </EntityFormScreen>
  );
}

const styles = StyleSheet.create({
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
  iconButton: {
    padding: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
