import { AccountPickerModal } from './AccountPickerModal';
import { AccountFormEditModals } from '@/src/features/accounts/components/AccountFormEditModals';
import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { AppearancePickerModal } from '@/src/components/common/AppearancePickerModal';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import type { ScreenNavChrome } from '@/src/components/layout';
import { FormHeroSection } from '@/src/components/common/FormHeroSection';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { InfoSheet } from '@/src/components/common/InfoSheet';
import { SectionLabel } from '@/src/components/common/SectionLabel';
import { AppIcon, AppText, IconName, isValidIconName, IvyIcon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Box, FadeIn, Inline, Stack } from '@/src/design-system';
import { useAccountColors } from '@/src/hooks/useAccountColors';

import { AccountSubtypeSelector } from '@/src/features/accounts/components/AccountSubtypeSelector';
import { AccountTypeSelector } from '@/src/features/accounts/components/AccountTypeSelector';
import { BalanceChangeClassifySheet } from '@/src/features/accounts/components/BalanceChangeClassifySheet';
import { CurrencySelector } from '@/src/features/accounts/components/CurrencySelector';
import { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { useTheme } from '@/src/hooks/use-theme';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { AccountMetadataSection } from './metadata/AccountMetadataSection';

export function AccountFormView(vm: AccountFormViewModel & { chrome: ScreenNavChrome }) {
  const { theme } = useTheme();
  const [isCurrencyInfoVisible, setIsCurrencyInfoVisible] = useState(false);
  const {
    chrome,
    isEditMode,
    isCategory,
    accountName,
    setAccountName,
    accountType,
    setAccountType,
    accountSubtype,
    setAccountSubtype,
    allowedAccountTypes,
    selectedCurrency,
    currencies,
    setSelectedCurrency,
    selectedIcon,
    setSelectedIcon,
    isAppearancePickerVisible,
    setIsAppearancePickerVisible,
    selectedColor,
    setSelectedColor,
    initialBalance,
    onInitialBalanceChange,
    formError,
    onSave,
    saveLabel,
    isSaveDisabled,
    parentAccountId,
    setParentAccountId,
    potentialParents,
    isParent,
    isParentPickerVisible,
    setIsParentPickerVisible,
    payFromAccountOptions,
    metadata,
    balanceClassify,
    formChrome,
  } = vm;

  const {
    isPayFromPickerVisible,
    setIsPayFromPickerVisible,
    payFromAccountId,
    setPayFromAccountId,
  } = metadata;

  const { accentColor: effectiveAccentColor } = useAccountColors({
    accountType,
    color: selectedColor,
  });

  return (
    <EntityFormScreen
      chrome={chrome}
      contentContainerStyle={{ paddingBottom: Spacing.xxxxl }}
      submitAction={{
        onPress: onSave,
        label: saveLabel,
        disabled: isSaveDisabled,
      }}
    >
      <FormHeroSection
        prefix={
          <Inline align="center">
            <TouchableOpacity
              onPress={() => setIsAppearancePickerVisible(true)}
              accessibilityLabel="Customize account appearance"
              style={[
                styles.iconButton,
                {
                  backgroundColor: withOpacity(effectiveAccentColor, Opacity.soft),
                  borderColor: effectiveAccentColor,
                  borderWidth: 3,
                },
              ]}
            >
              <IvyIcon
                name={selectedIcon as IconName}
                fallbackIcon={getAccountFallbackIcon(accountType)}
                color={effectiveAccentColor}
                size={Size.iconLg}
              />
            </TouchableOpacity>
          </Inline>
        }
        nameAlign="left"
        nameLabel={
          isCategory
            ? AppConfig.strings.accounts.categoryForm.categoryName
            : AppConfig.strings.accounts.form.accountName
        }
        nameValue={accountName}
        onNameChange={setAccountName}
        namePlaceholder={
          isCategory
            ? AppConfig.strings.accounts.categoryForm.categoryNamePlaceholder
            : AppConfig.strings.accounts.form.accountNamePlaceholder
        }
        amountLabel={
          isEditMode
            ? AppConfig.strings.accounts.form.currentBalance
            : AppConfig.strings.accounts.form.initialBalance
        }
        amountValue={initialBalance}
        onAmountChange={onInitialBalanceChange}
        currencySymbol={CURRENCY_SYMBOLS[selectedCurrency] || selectedCurrency}
        showAmount={vm.showInitialBalance}
        footer={
          !isCategory ? (
            <Inline align="center" space="xs">
              {isEditMode && (
                <Stack space="xs" align="flex-start">
                  <TouchableOpacity
                    onPress={() => setIsCurrencyInfoVisible(true)}
                    style={{
                      padding: Spacing.sm,
                      marginRight: -Spacing.sm,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                    activeOpacity={Opacity.medium}
                  >
                    <AppText
                      variant="caption"
                      color="secondary"
                      style={{ marginRight: Spacing.xs }}
                    >
                      {selectedCurrency} (Locked)
                    </AppText>
                    <AppIcon
                      name="helpCircle"
                      size={Size.iconSm}
                      color={theme.textSecondary}
                      opacity={Opacity.heavy}
                    />
                  </TouchableOpacity>
                </Stack>
              )}
              {!isEditMode && (
                <CurrencySelector
                  variant="pill"
                  selectedCurrency={selectedCurrency}
                  currencies={currencies}
                  onSelect={setSelectedCurrency}
                  disabled={isEditMode}
                />
              )}
            </Inline>
          ) : undefined
        }
      />

      <Stack space="xl" padding="lg">
        {formError ? (
          <FadeIn duration={400}>
            <Box
              padding="md"
              borderRadius="md"
              borderWidth={1}
              borderColor="error"
              background="error"
              backgroundOpacity="soft"
            >
              <AppText variant="body" style={{ color: theme.error }}>
                {formError}
              </AppText>
            </Box>
          </FadeIn>
        ) : null}

        <FormSectionGroup
          title={
            isCategory
              ? AppConfig.strings.accounts.categoryForm.categoryType
              : AppConfig.strings.accounts.form.accountType
          }
        >
          <Stack space="lg" paddingHorizontal="md">
            <Box>
              <AccountTypeSelector
                value={accountType}
                onChange={setAccountType}
                disabled={isParent}
                allowedTypes={allowedAccountTypes ? [...allowedAccountTypes] : undefined}
              />
            </Box>

            <Box>
              <SectionLabel
                label={
                  isCategory
                    ? AppConfig.strings.accounts.categoryForm.categorySubtype
                    : AppConfig.strings.accounts.form.accountSubtype
                }
                marginTop="none"
              />
              <AccountSubtypeSelector
                accountType={accountType}
                value={accountSubtype}
                onChange={setAccountSubtype}
                disabled={isParent}
              />
            </Box>
          </Stack>
        </FormSectionGroup>

        <FormSectionGroup title={isCategory ? 'Hierarchy' : undefined}>
          <Stack space="lg" paddingHorizontal="md">
            <AccountSelectionRow
              title={
                isCategory
                  ? AppConfig.strings.accounts.categoryForm.parentCategory
                  : AppConfig.strings.accounts.form.parentAccount
              }
              accounts={potentialParents}
              selectedAccountId={parentAccountId}
              placeholder={AppConfig.strings.common.none}
              onPress={() => setIsParentPickerVisible(true)}
              style={{ paddingHorizontal: 0 }}
            />
          </Stack>
        </FormSectionGroup>

        <AccountMetadataSection
          accountType={accountType}
          accountSubtype={accountSubtype}
          metadata={metadata}
        />
      </Stack>

      <AppearancePickerModal
        key={isAppearancePickerVisible ? 'appearance-open' : 'appearance-closed'}
        visible={isAppearancePickerVisible}
        onClose={() => setIsAppearancePickerVisible(false)}
        onIconSelect={setSelectedIcon}
        onColorSelect={setSelectedColor}
        selectedIcon={isValidIconName(selectedIcon) ? (selectedIcon as IconName) : 'wallet'}
        selectedColor={selectedColor}
        accountType={accountType}
      />
      <AccountPickerModal
        visible={isParentPickerVisible}
        accounts={potentialParents}
        selectedId={parentAccountId}
        allowNone
        noneLabel="No parent"
        onClear={() => setParentAccountId(EMPTY_ACCOUNT_ID)}
        onClose={() => setIsParentPickerVisible(false)}
        onSelect={id => {
          setParentAccountId(id);
          setIsParentPickerVisible(false);
        }}
      />
      {!isCategory && (
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
      )}
      <InfoSheet
        visible={isCurrencyInfoVisible}
        title={AppConfig.strings.accounts.selectCurrency}
        onClose={() => setIsCurrencyInfoVisible(false)}
        fixedHeight={false}
        primaryAction={{
          label: AppConfig.strings.common.ok,
          onPress: () => setIsCurrencyInfoVisible(false),
        }}
      >
        <Stack space="md" padding="md">
          <AppText variant="body" color="secondary" style={{ lineHeight: 22 }}>
            {AppConfig.strings.accounts.form.currencyLockedTooltip}
          </AppText>
        </Stack>
      </InfoSheet>
      {balanceClassify ? (
        <BalanceChangeClassifySheet
          visible={balanceClassify.visible}
          accounts={balanceClassify.accounts}
          editedAccountId={balanceClassify.editedAccountId}
          editedAccountName={balanceClassify.editedAccountName}
          editedAccountType={balanceClassify.editedAccountType}
          currencyCode={balanceClassify.currencyCode}
          discrepancy={balanceClassify.discrepancy}
          discrepancyLabel={balanceClassify.discrepancyLabel}
          onClose={balanceClassify.onClose}
          onSelect={balanceClassify.onSelect}
        />
      ) : null}
      <AccountFormEditModals
        archiveCascadeModal={formChrome.archiveCascadeModal}
        mergePickerModal={formChrome.mergePickerModal}
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
    marginBottom: Spacing.sm,
  },
  metadataRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  iconButton: {
    padding: Spacing.md,
    borderRadius: Shape.radius.full,
    borderWidth: 1.5,
  },
});
