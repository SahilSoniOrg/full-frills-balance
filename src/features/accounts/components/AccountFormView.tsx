import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { AppIcon, AppText, Icon, ListGroup } from '@/src/components/core';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { FormRow, GlyphCarousel, SuggestionHint, UnderlineNameField } from '@/src/components/forms';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import type { ScreenNavChrome } from '@/src/components/layout';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { AppConfig } from '@/src/constants/app-config';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Shape, Size, Spacing } from '@/src/constants/design-tokens';
import type { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { StyleSheet, View } from 'react-native';
import { AccountFormOverlays } from './AccountFormOverlays';
import { AccountMetadataSection } from './metadata/AccountMetadataSection';

export function AccountFormView(vm: AccountFormViewModel & { chrome: ScreenNavChrome }) {
  const { theme } = useTheme();
  const entity = vm.isCategory ? 'category' : 'account';
  return (
    <EntityFormScreen
      chrome={vm.chrome}
      submitAction={{ onPress: vm.onSave, label: vm.submitLabel, disabled: vm.isSaveDisabled }}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
    >
      <View>
        {vm.selectedKindKey ? (
          <GlyphCarousel
            items={vm.carouselKinds}
            selectedKey={vm.selectedKindKey}
            onSelect={vm.selectKindKey}
            captionAction={
              vm.isParent
                ? undefined
                : { label: copy.allKinds, onPress: () => vm.setActiveSheet('kinds') }
            }
            testID={`${entity}-kind`}
            accessibilityLabel={vm.isCategory ? copy.categoryKind : undefined}
          />
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
            <AppIcon name={vm.selectedIcon} size={Size.iconXl} color={theme.textSecondary} />
          </View>
        )}
        <PressScaleTouchable
          style={styles.pencilTarget}
          onPress={() => vm.setIsAppearancePickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={vm.isCategory ? copy.categoryAppearance : copy.appearance}
          testID={`${entity}-appearance`}
        >
          <View
            style={[
              styles.pencilBadge,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
          >
            <AppIcon name={Icon.Edit} size={Size.iconXs} color={theme.textSecondary} />
          </View>
        </PressScaleTouchable>
      </View>
      <View style={styles.name}>
        <UnderlineNameField
          value={vm.accountName}
          onChangeText={vm.setAccountName}
          placeholder={
            vm.isCategory
              ? AppConfig.strings.accounts.categoryForm.categoryNamePlaceholder
              : copy.namePlaceholder
          }
          autoFocus={!vm.isEditMode}
          maxLength={AppConfig.constants.validation.maxAccountNameLength}
          testID="hero-name-input"
        />
        {vm.kindSuggestionMessage ? (
          <SuggestionHint
            message={vm.kindSuggestionMessage}
            actionLabel={copy.switchKind}
            onAccept={vm.acceptKindSuggestion}
            onDismiss={vm.dismissKindSuggestion}
            testID="account-kind-suggestion"
          />
        ) : null}
      </View>
      {vm.showInitialBalance ? (
        <View style={styles.amount}>
          <CalculatorAmountInput
            variant="centered"
            value={vm.initialBalance}
            onChangeText={vm.onInitialBalanceChange}
            label={vm.balanceLabel}
            currencySymbol={CURRENCY_SYMBOLS[vm.selectedCurrency] || vm.selectedCurrency}
            currencyCode={vm.selectedCurrency}
            precision={vm.currencyPrecision}
            onCurrencyPress={() => vm.setActiveSheet(vm.isEditMode ? 'currency-info' : 'currency')}
            testID="hero-amount-input"
          />
        </View>
      ) : (
        <FormRow
          icon={Icon.Bank}
          title={AppConfig.strings.accounts.selectCurrency}
          value={vm.selectedCurrency}
          onPress={() => vm.setActiveSheet(vm.isEditMode ? 'currency-info' : 'currency')}
          testID={`${entity}-currency`}
        />
      )}
      {vm.formError ? (
        <AppText
          variant="bodySmall"
          style={{ color: theme.error, paddingHorizontal: Spacing.lg }}
          accessibilityRole="alert"
        >
          {vm.formError}
        </AppText>
      ) : null}
      <AccountMetadataSection
        accountType={vm.accountType}
        accountSubtype={vm.accountSubtype}
        metadata={vm.metadata}
        precision={vm.currencyPrecision}
      />
      <View style={styles.section}>
        <SectionLabel label={copy.optional} />
      </View>
      <ListGroup variant="plain">
        <FormRow
          icon={Icon.Hierarchy}
          title={vm.isCategory ? copy.categoryParent : copy.parent}
          value={vm.parentAccountName}
          placeholder={copy.none}
          onPress={() => vm.setIsParentPickerVisible(true)}
          onClear={vm.parentAccountId ? () => vm.setParentAccountId(EMPTY_ACCOUNT_ID) : undefined}
          testID={`${entity}-parent`}
        />
        <FormRow
          icon={Icon.Document}
          title={copy.note}
          value={vm.metadata.notes || null}
          placeholder={copy.add}
          onPress={() => vm.setActiveSheet('note')}
          onClear={vm.metadata.notes ? () => vm.metadata.setNotes('') : undefined}
          testID={`${entity}-note`}
        />
      </ListGroup>
      <AccountFormOverlays {...vm} />
    </EntityFormScreen>
  );
}

const styles = StyleSheet.create({
  name: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  amount: { paddingTop: Spacing.lg, paddingHorizontal: Spacing.lg },
  section: { paddingHorizontal: Spacing.lg },
  pencilTarget: {
    position: 'absolute',
    left: '50%',
    marginLeft: Spacing.lg,
    top: Size.touchTargetLg + Spacing.md,
    width: Size.touchTarget,
    height: Size.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencilBadge: {
    width: Size.iconLg,
    height: Size.iconLg,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
