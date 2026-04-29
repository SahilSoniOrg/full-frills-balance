import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { FormHeroSection } from '@/src/components/common/FormHeroSection';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { InfoSheet } from '@/src/components/common/InfoSheet';
import { SectionLabel } from '@/src/components/common/SectionLabel';
import { AppIcon, AppText, IconName, isValidIconName, IvyIcon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { Box, FadeIn, Inline, Stack } from '@/src/design-system';
import { AccountSubtypeSelector } from '@/src/features/accounts/components/AccountSubtypeSelector';
import { AccountTypeSelector } from '@/src/features/accounts/components/AccountTypeSelector';
import { CurrencySelector } from '@/src/features/accounts/components/CurrencySelector';
import { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { AccountMetadataSection } from './metadata/AccountMetadataSection';

export function AccountFormView(vm: AccountFormViewModel) {
  const { theme } = useTheme();
  const [isCurrencyInfoVisible, setIsCurrencyInfoVisible] = useState(false);
  const {
    heroTitle,
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
    isSaveDisabled,
    parentAccountId,
    setParentAccountId,
    potentialParents,
    isParent,
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
      contentContainerStyle={{ paddingBottom: Spacing.xxxxl }}
      submitAction={{
        onPress: onSave,
        label: saveLabel,
        disabled: isSaveDisabled,
      }}
    >
      <FormHeroSection
        prefix={
          <TouchableOpacity
            onPress={() => setIsIconPickerVisible(true)}
            style={[
              styles.iconButton,
              {
                backgroundColor: withOpacity(theme.primary, Opacity.soft),
                borderColor: withOpacity(theme.primary, Opacity.medium),
              },
            ]}
          >
            <IvyIcon
              name={selectedIcon as IconName}
              fallbackIcon="wallet"
              color={theme.primary}
              size={Size.iconLg}
            />
          </TouchableOpacity>
        }
        nameAlign="left"
        nameLabel={AppConfig.strings.accounts.form.accountName}
        nameValue={accountName}
        onNameChange={setAccountName}
        namePlaceholder={AppConfig.strings.accounts.form.accountNamePlaceholder}
        amountLabel={
          isEditMode
            ? AppConfig.strings.accounts.form.currentBalance
            : AppConfig.strings.accounts.form.initialBalance
        }
        amountValue={initialBalance}
        onAmountChange={onInitialBalanceChange}
        footer={
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
                  <AppText variant="caption" color="secondary" style={{ marginRight: Spacing.xs }}>
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

        <FormSectionGroup title={AppConfig.strings.accounts.form.accountType}>
          <Stack space="lg" paddingHorizontal="md">
            <Box>
              <AccountTypeSelector
                value={accountType}
                onChange={setAccountType}
                disabled={isParent}
              />
            </Box>

            <Box>
              <SectionLabel
                label={AppConfig.strings.accounts.form.accountSubtype}
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

        <FormSectionGroup>
          <Stack space="lg" paddingHorizontal="md">
            <AccountSelectionRow
              title={AppConfig.strings.accounts.form.parentAccount}
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

      <IconPickerModal
        visible={isIconPickerVisible}
        onClose={() => setIsIconPickerVisible(false)}
        onSelect={icon => {
          setSelectedIcon(icon);
          setIsIconPickerVisible(false);
        }}
        selectedIcon={isValidIconName(selectedIcon) ? (selectedIcon as IconName) : 'wallet'}
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
