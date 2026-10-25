import {
  AppCard,
  AppIcon,
  AppText,
  Icon,
  ListGroup,
  PressScaleTouchable,
} from '@/src/components/core';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { FormRow, SuggestionHint, UnderlineNameField } from '@/src/components/forms';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import type { ScreenNavChrome } from '@/src/components/layout';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { AppConfig } from '@/src/constants/app-config';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import {
  getAccountKind,
  getAccountSubtypeColor,
  getAccountTypeDescription,
  getAccountTypeIcon,
} from '@/src/features/accounts/helpers/accountKinds';
import { resolveCurrencySymbol } from '@/src/features/accounts/helpers/currencyPickerOptions';
import type { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { getReadableColor, withOpacity } from '@/src/utils/color-math';
import { StyleSheet, View } from 'react-native';
import { AccountFormOverlays } from './AccountFormOverlays';
import { AccountMetadataSection } from './metadata/AccountMetadataSection';

export function AccountFormView(vm: AccountFormViewModel & { chrome: ScreenNavChrome }) {
  const { theme } = useTheme();
  const entity = vm.isCategory ? 'category' : 'account';
  const { accentColor, categoryColor } = resolveAccountAppearance(
    { accountType: vm.accountType, color: vm.selectedColor },
    theme,
  );
  const typeColor = getReadableColor(categoryColor, theme.surface);
  const subtypeColor = getReadableColor(
    getAccountSubtypeColor(vm.accountType, vm.accountSubtype),
    theme.surface,
  );
  const subtypeIcon = getAccountKind(vm.accountType, vm.accountSubtype)?.icon ?? vm.selectedIcon;
  const currencySymbol = resolveCurrencySymbol(
    vm.selectedCurrency,
    vm.currencies,
    CURRENCY_SYMBOLS,
  );
  const currencyControl = (
    <PressScaleTouchable
      style={[
        styles.currencyControl,
        {
          backgroundColor: vm.canEditCurrency ? theme.surface : theme.surfaceSecondary,
          borderColor: theme.border,
        },
      ]}
      onPress={() => vm.setActiveSheet(vm.canEditCurrency ? 'currency' : 'currency-info')}
      accessibilityRole="button"
      accessibilityLabel={`${AppConfig.strings.accounts.selectCurrency}: ${vm.selectedCurrency}`}
      accessibilityHint={
        !vm.canEditCurrency ? AppConfig.strings.accounts.form.currencyLockedTooltip : undefined
      }
      testID={`${entity}-currency`}
    >
      <View style={styles.currencyStack}>
        <AppText
          weight="semibold"
          style={[
            styles.currencySymbol,
            { color: vm.canEditCurrency ? theme.primary : theme.textTertiary },
          ]}
        >
          {currencySymbol}
        </AppText>
        <AppText
          variant="caption"
          color={vm.canEditCurrency ? 'secondary' : 'tertiary'}
          weight="medium"
        >
          {vm.selectedCurrency}
        </AppText>
      </View>
      {vm.canEditCurrency ? (
        <View
          style={[
            styles.appearanceEdit,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <AppIcon name={Icon.Edit} size={Size.xxs} color={theme.textSecondary} />
        </View>
      ) : null}
    </PressScaleTouchable>
  );
  return (
    <EntityFormScreen
      chrome={vm.chrome}
      submitAction={{ onPress: vm.onSave, label: vm.submitLabel, disabled: vm.isSaveDisabled }}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
    >
      <View style={styles.identitySection}>
        <SectionLabel label={copy.name} marginTop="none" />
        <View style={styles.nameRow}>
          <PressScaleTouchable
            style={[
              styles.appearanceButton,
              { backgroundColor: withOpacity(accentColor, Opacity.soft) },
            ]}
            onPress={() => vm.setIsAppearancePickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={vm.isCategory ? copy.categoryAppearance : copy.appearance}
            testID={`${entity}-appearance`}
          >
            <AppIcon name={vm.selectedIcon} size={Size.iconMd} color={accentColor} />
            <View
              style={[
                styles.appearanceEdit,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <AppIcon name={Icon.Edit} size={Size.xxs} color={theme.textSecondary} />
            </View>
          </PressScaleTouchable>
          <View style={styles.nameInput}>
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
          </View>
        </View>
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
      <AppCard
        variant="ghost"
        radius="md"
        borderColor="border"
        paddingSize="none"
        style={styles.selectorSection}
      >
        <View style={styles.selectorGroup}>
          <PressScaleTouchable
            style={styles.selectorPressable}
            pressScale="subtle"
            onPress={vm.isParent ? undefined : () => vm.setActiveSheet('type')}
            disabled={vm.isParent}
            accessibilityRole="button"
            accessibilityState={{ disabled: vm.isParent }}
            accessibilityLabel={`${copy.type}: ${copy.typeNames[vm.accountType]}`}
            accessibilityHint={getAccountTypeDescription(vm.accountType)}
            testID={`${entity}-type`}
          >
            <View
              style={[
                styles.selectorIcon,
                { backgroundColor: withOpacity(typeColor, Opacity.soft) },
              ]}
            >
              <AppIcon
                name={getAccountTypeIcon(vm.accountType)}
                size={Size.iconXs}
                color={typeColor}
              />
            </View>
            <View style={styles.selectorText}>
              <AppText variant="caption" color="secondary">
                {copy.type}
              </AppText>
              <AppText variant="bodySmall" weight="semibold" style={{ color: typeColor }}>
                {copy.typeNames[vm.accountType]}
              </AppText>
            </View>
            <AppIcon
              name={vm.isParent ? Icon.Lock : Icon.ChevronDown}
              size={Size.iconXs}
              color={theme.textSecondary}
            />
          </PressScaleTouchable>
          <View style={[styles.selectorDivider, { backgroundColor: theme.border }]} />
          <PressScaleTouchable
            style={styles.selectorPressable}
            pressScale="subtle"
            onPress={vm.isParent ? undefined : () => vm.setActiveSheet('subtype')}
            disabled={vm.isParent}
            accessibilityRole="button"
            accessibilityState={{ disabled: vm.isParent }}
            accessibilityLabel={`${copy.subtype}: ${vm.kindLabel ?? vm.accountSubtype}`}
            testID={`${entity}-subtype`}
          >
            <View
              style={[
                styles.selectorIcon,
                { backgroundColor: withOpacity(subtypeColor, Opacity.soft) },
              ]}
            >
              <AppIcon name={subtypeIcon} size={Size.iconXs} color={subtypeColor} />
            </View>
            <View style={styles.selectorText}>
              <AppText variant="caption" color="secondary">
                {copy.subtype}
              </AppText>
              <AppText variant="bodySmall" weight="semibold" style={{ color: subtypeColor }}>
                {vm.kindLabel ?? vm.accountSubtype}
              </AppText>
            </View>
            <AppIcon
              name={vm.isParent ? Icon.Lock : Icon.ChevronDown}
              size={Size.iconXs}
              color={theme.textSecondary}
            />
          </PressScaleTouchable>
        </View>
        <AppText variant="caption" color="secondary" style={styles.selectorDescription}>
          {getAccountTypeDescription(vm.accountType)}
        </AppText>
      </AppCard>
      <View style={styles.balanceSection}>
        <View style={styles.balanceHeader}>
          <AppText
            variant="bodySmall"
            color="secondary"
            weight="medium"
            style={styles.balanceLabel}
          >
            {vm.showInitialBalance ? vm.balanceLabel : AppConfig.strings.accounts.selectCurrency}
          </AppText>
          {!vm.showInitialBalance ? currencyControl : null}
        </View>
        {vm.showInitialBalance ? (
          <View style={styles.balanceAmountRow}>
            {currencyControl}
            <CalculatorAmountInput
              variant="hero"
              value={vm.initialBalance}
              onChangeText={vm.onInitialBalanceChange}
              currency={vm.selectedCurrency}
              currencySymbol={currencySymbol}
              showCurrencyPrefix={false}
              precision={vm.currencyPrecision}
              containerStyle={styles.amountInput}
              testID="hero-amount-input"
            />
          </View>
        ) : null}
      </View>
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
  identitySection: {
    paddingHorizontal: Spacing.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  nameInput: { flex: 1, minWidth: 0 },
  appearanceButton: {
    width: Size.touchTargetLg,
    height: Size.touchTargetLg,
    borderRadius: Shape.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appearanceEdit: {
    position: 'absolute',
    right: -Spacing.xs,
    bottom: -Spacing.xs,
    width: Size.iconSm,
    height: Size.iconSm,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorSection: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  selectorGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  selectorPressable: {
    flex: 1,
    minWidth: 0,
    minHeight: Size.buttonLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  selectorDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: Spacing.md,
  },
  selectorDescription: { paddingHorizontal: Spacing.md },
  selectorText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  selectorIcon: {
    width: Size.iconLg,
    height: Size.iconLg,
    borderRadius: Shape.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceSection: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  balanceLabel: { flex: 1 },
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  currencyControl: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: Size.touchTargetLg,
    minHeight: Size.touchTargetLg,
    padding: Spacing.sm,
    borderWidth: 1,
    borderRadius: Shape.radius.md,
  },
  currencyStack: { alignItems: 'center' },
  currencySymbol: {
    fontSize: Typography.sizes.xxl,
    lineHeight: Typography.sizes.xxl * Typography.lineHeights.tight,
  },
  amountInput: { flex: 1, paddingHorizontal: 0, paddingVertical: 0 },
  section: { paddingHorizontal: Spacing.lg },
});
