import { Pressable } from 'react-native';
import { AccountPickerModal } from '@/src/components/account-selection/AccountPickerModal';
import { AccountSelectionRow } from '@/src/components/accounts/AccountSelectionRow';
import { AppearancePickerModal } from '@/src/components/overlays/AppearancePickerModal';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { FormHeroSection } from '@/src/components/forms/FormHeroSection';
import { FormSectionGroup } from '@/src/components/forms/FormSectionGroup';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { Icon, AppIcon, AppText, IvyIcon } from '@/src/components/core';
import type { ScreenNavChrome } from '@/src/components/layout';
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { AppConfig } from '@/src/constants/app-config';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { withOpacity } from '@/src/utils/color-math';
import { Box, FadeIn, Inline, Stack } from '@/src/design-system';
import { useAccountColors } from '@/src/hooks/useAccountColors';
import { useTheme } from '@/src/hooks/use-theme';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import type { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { AccountTypeSelector } from './AccountTypeSelector';
import { AccountSubtypeSelector } from './AccountSubtypeSelector';
import { CurrencySelector } from './CurrencySelector';
import { AccountFormEditModals } from './AccountFormEditModals';
import { NotesMetadataField } from './metadata/NotesMetadataField';

/** Category controls retain their existing behavior independently of the account carousel. */
export function CategoryAccountFormView(vm: AccountFormViewModel & { chrome: ScreenNavChrome }) {
  const { theme } = useTheme();
  const { accentColor } = useAccountColors({
    accountType: vm.accountType,
    color: vm.selectedColor,
  });
  return (
    <EntityFormScreen
      chrome={vm.chrome}
      contentContainerStyle={{ paddingBottom: Spacing.xxxxl }}
      submitAction={{ onPress: vm.onSave, label: vm.saveLabel, disabled: vm.isSaveDisabled }}
    >
      <FormHeroSection
        showAmount={false}
        nameAlign="left"
        nameLabel={AppConfig.strings.accounts.categoryForm.categoryName}
        nameValue={vm.accountName}
        onNameChange={vm.setAccountName}
        namePlaceholder={AppConfig.strings.accounts.categoryForm.categoryNamePlaceholder}
        prefix={
          <Inline align="center">
            <Pressable
              onPress={() => vm.setIsAppearancePickerVisible(true)}
              accessibilityLabel={copy.appearance}
              accessibilityRole="button"
              testID="category-appearance"
              style={{
                padding: Spacing.md,
                borderRadius: Shape.radius.full,
                backgroundColor: withOpacity(accentColor, Opacity.soft),
                borderColor: accentColor,
                borderWidth: 3,
              }}
            >
              <IvyIcon
                name={vm.selectedIcon}
                fallbackIcon={Icon.Tag}
                color={accentColor}
                size={Size.iconLg}
              />
            </Pressable>
          </Inline>
        }
        footer={
          vm.isEditMode ? (
            <Pressable
              onPress={() => vm.setActiveSheet('currency-info')}
              style={{ padding: Spacing.sm, flexDirection: 'row', alignItems: 'center' }}
            >
              <AppText variant="caption" color="secondary" style={{ marginRight: Spacing.xs }}>
                {copy.lockedCurrency(vm.selectedCurrency)}
              </AppText>
              <AppIcon
                name={Icon.HelpCircle}
                size={Size.iconSm}
                color={theme.textSecondary}
                opacity={Opacity.heavy}
              />
            </Pressable>
          ) : (
            <CurrencySelector
              variant="pill"
              selectedCurrency={vm.selectedCurrency}
              currencies={vm.currencies}
              onSelect={vm.setSelectedCurrency}
            />
          )
        }
      />
      <Stack space="xl" padding="lg">
        {vm.formError ? (
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
                {vm.formError}
              </AppText>
            </Box>
          </FadeIn>
        ) : null}
        <FormSectionGroup title={AppConfig.strings.accounts.categoryForm.categoryType}>
          <Stack space="lg" paddingHorizontal="md">
            <AccountTypeSelector
              value={vm.accountType}
              onChange={vm.setAccountType}
              disabled={vm.isParent}
              allowedTypes={vm.allowedAccountTypes ? [...vm.allowedAccountTypes] : undefined}
            />
            <Box>
              <SectionLabel
                label={AppConfig.strings.accounts.categoryForm.categorySubtype}
                marginTop="none"
              />
              <AccountSubtypeSelector
                accountType={vm.accountType}
                value={vm.accountSubtype}
                onChange={vm.setAccountSubtype}
                disabled={vm.isParent}
              />
            </Box>
          </Stack>
        </FormSectionGroup>
        <FormSectionGroup title={copy.categoryHierarchy}>
          <Stack space="lg" paddingHorizontal="md">
            <AccountSelectionRow
              title={AppConfig.strings.accounts.categoryForm.parentCategory}
              accounts={vm.potentialParents}
              selectedAccountId={vm.parentAccountId}
              placeholder={AppConfig.strings.common.none}
              onPress={() => vm.setIsParentPickerVisible(true)}
              style={{ paddingHorizontal: 0 }}
            />
          </Stack>
        </FormSectionGroup>
        <FormSectionGroup title={copy.legacyAdditionalInfo} style={{ marginTop: Spacing.sm }}>
          <NotesMetadataField notes={vm.metadata.notes} setNotes={vm.metadata.setNotes} />
        </FormSectionGroup>
      </Stack>
      <AppearancePickerModal
        key={vm.isAppearancePickerVisible ? 'appearance-open' : 'appearance-closed'}
        visible={vm.isAppearancePickerVisible}
        onClose={() => vm.setIsAppearancePickerVisible(false)}
        onIconSelect={vm.setSelectedIcon}
        onColorSelect={vm.setSelectedColor}
        selectedIcon={vm.selectedIcon}
        selectedColor={vm.selectedColor}
        accountType={vm.accountType}
      />
      <AccountPickerModal
        visible={vm.isParentPickerVisible}
        accounts={vm.potentialParents}
        selectedId={vm.parentAccountId}
        allowNone
        noneLabel={copy.noParent}
        onClear={() => vm.setParentAccountId(EMPTY_ACCOUNT_ID)}
        onClose={() => vm.setIsParentPickerVisible(false)}
        onSelect={id => {
          vm.setParentAccountId(id);
          vm.setIsParentPickerVisible(false);
        }}
      />
      <InfoSheet
        visible={vm.activeSheet === 'currency-info'}
        title={AppConfig.strings.accounts.selectCurrency}
        onClose={() => vm.setActiveSheet(null)}
        fixedHeight={false}
        primaryAction={{
          label: AppConfig.strings.common.ok,
          onPress: () => vm.setActiveSheet(null),
        }}
      >
        <Stack space="md" padding="md">
          <AppText variant="body" color="secondary" style={{ lineHeight: Size.iconMd }}>
            {AppConfig.strings.accounts.form.currencyLockedTooltip}
          </AppText>
        </Stack>
      </InfoSheet>
      <AccountFormEditModals
        archiveCascadeModal={vm.formChrome.archiveCascadeModal}
        mergePickerModal={vm.formChrome.mergePickerModal}
      />
    </EntityFormScreen>
  );
}
