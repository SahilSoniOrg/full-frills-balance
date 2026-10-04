import { AccountPickerModal } from '@/src/components/account-selection/AccountPickerModal';
import { AppearancePickerModal } from '@/src/components/overlays/AppearancePickerModal';
import { CurrencyPickerSheet } from '@/src/components/filters/CurrencyPickerSheet';
import { AppButton, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { AppConfig } from '@/src/constants/app-config';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import type { AccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { AccountKindsSheet } from './AccountKindsSheet';
import { AccountFormEditModals } from './AccountFormEditModals';
import { BalanceChangeClassifySheet } from './BalanceChangeClassifySheet';
import { NotesMetadataField } from './metadata/NotesMetadataField';

export function AccountFormOverlays(vm: AccountFormViewModel) {
  const close = () => vm.setActiveSheet(null);
  return (
    <>
      <AccountKindsSheet
        visible={vm.activeSheet === 'kinds'}
        isCategory={vm.isCategory}
        onSelect={vm.setAccountKind}
        onClose={close}
      />
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
      <CurrencyPickerSheet
        visible={vm.activeSheet === 'currency'}
        title={AppConfig.strings.accounts.selectCurrency}
        currencies={vm.currencies}
        selectedCode={vm.selectedCurrency}
        onClose={close}
        onSelect={code => {
          vm.setSelectedCurrency(code);
          close();
        }}
      />
      <InfoSheet
        visible={vm.activeSheet === 'currency-info'}
        title={AppConfig.strings.accounts.selectCurrency}
        onClose={close}
        fixedHeight={false}
        primaryAction={{ label: copy.done, onPress: close }}
      >
        <AppText variant="body" color="secondary">
          {AppConfig.strings.accounts.form.currencyLockedTooltip}
        </AppText>
      </InfoSheet>
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
      <AccountPickerModal
        visible={vm.metadata.isPayFromPickerVisible}
        accounts={vm.payFromAccountOptions}
        selectedId={vm.metadata.payFromAccountId}
        title={copy.selectPayFrom}
        allowNone
        noneLabel={copy.none}
        onClear={() => vm.metadata.setPayFromAccountId(EMPTY_ACCOUNT_ID)}
        onClose={() => vm.metadata.setIsPayFromPickerVisible(false)}
        onSelect={id => {
          vm.metadata.setPayFromAccountId(id);
          vm.metadata.setIsPayFromPickerVisible(false);
        }}
      />
      <ModalSurface
        visible={vm.activeSheet === 'note'}
        title={copy.note}
        onClose={close}
        accessibilityCloseLabel={copy.closeSheet}
        closeTestID="account-note-close"
        position="bottomSheet"
        fixedHeight={false}
        footer={
          <AppButton onPress={close} testID="account-note-done">
            {copy.done}
          </AppButton>
        }
      >
        <NotesMetadataField
          notes={vm.metadata.notes}
          setNotes={vm.metadata.setNotes}
          label={copy.note}
          testID="account-note-input"
        />
      </ModalSurface>
      {vm.balanceClassify ? <BalanceChangeClassifySheet {...vm.balanceClassify} /> : null}
      <AccountFormEditModals
        archiveCascadeModal={vm.formChrome.archiveCascadeModal}
        mergePickerModal={vm.formChrome.mergePickerModal}
      />
    </>
  );
}
