import { AccountSubtype, AccountType, AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';

import {
  buildAccountSavePayload,
  resolveAccountFormDefaults,
  resolveAccountInitialBalance,
} from '../accountFormService';

describe('accountFormService', () => {
  const workplaceCurrency = 'USD';

  describe('resolveAccountFormDefaults', () => {
    it('resolves create-mode defaults from route preview and workplace currency', () => {
      const defaults = resolveAccountFormDefaults(
        {
          pathname: '/account-creation',
          typeParam: 'asset',
          previewName: 'Savings',
          previewType: 'income',
          previewCurrency: 'EUR',
          previewIcon: 'pieChart',
        },
        workplaceCurrency,
      );

      expect(defaults.accountName).toBe('Savings');
      expect(defaults.accountType).toBe(AccountType.INCOME);
      expect(defaults.selectedCurrency).toBe('EUR');
      expect(defaults.selectedIcon).toBe('pieChart');
      expect(defaults.parentAccountId).toBe(EMPTY_ACCOUNT_ID);
    });

    it('falls back to route type and workplace currency when preview fields are missing', () => {
      const defaults = resolveAccountFormDefaults(
        { pathname: '/account-creation', typeParam: 'liability' },
        workplaceCurrency,
      );

      expect(defaults.accountName).toBe('');
      expect(defaults.accountType).toBe(AccountType.LIABILITY);
      expect(defaults.selectedCurrency).toBe(workplaceCurrency);
    });

    it('overrides with existing account fields in edit mode', () => {
      const existingAccount = {
        name: 'Checking',
        accountType: AccountType.ASSET,
        accountSubtype: undefined,
        currencyCode: 'GBP',
        icon: 'wallet',
        parentAccountId: 'parent-1' as AccountId,
      } as any;

      const defaults = resolveAccountFormDefaults(
        { pathname: '/account-edit', previewName: 'Ignored' },
        workplaceCurrency,
        existingAccount,
      );

      expect(defaults.accountName).toBe('Checking');
      expect(defaults.accountType).toBe(AccountType.ASSET);
      expect(defaults.selectedCurrency).toBe('GBP');
      expect(defaults.parentAccountId).toBe('parent-1');
    });
  });

  describe('resolveAccountInitialBalance', () => {
    it('returns empty string when balance data is missing', () => {
      expect(resolveAccountInitialBalance(null)).toBe('');
      expect(resolveAccountInitialBalance(undefined)).toBe('');
    });

    it('stringifies balance from snapshot data', () => {
      expect(resolveAccountInitialBalance({ balance: 1250.5 })).toBe('1250.5');
    });
  });

  describe('buildAccountSavePayload', () => {
    const baseMetadata = {
      statementDay: '',
      dueDay: '',
      creditLimitAmount: '',
      apr: '',
      emiDay: '',
      loanTenureMonths: '',
      minimumPaymentAmount: '',
      minimumPaymentPercent: '',
      isMinPaymentOnly: false,
      payFromAccountId: EMPTY_ACCOUNT_ID,
      notes: '',
    };

    it('rejects non-numeric initial balance for non-category accounts', () => {
      const result = buildAccountSavePayload({
        accountName: 'Cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        selectedCurrency: 'USD',
        selectedIcon: 'wallet',
        selectedColor: '',
        initialBalance: 'not-a-number',
        parentAccountId: EMPTY_ACCOUNT_ID,
        metadataValues: baseMetadata,
        hasExistingMetadata: false,
      });

      expect(result).toEqual({ ok: false, error: 'Initial balance must be a number' });
    });

    it('builds persistence payload for a valid asset account', () => {
      const result = buildAccountSavePayload({
        accountName: 'Cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        selectedCurrency: 'USD',
        selectedIcon: 'wallet',
        selectedColor: '#7DD3A8',
        initialBalance: '100',
        parentAccountId: EMPTY_ACCOUNT_ID,
        metadataValues: baseMetadata,
        hasExistingMetadata: false,
        balanceData: { balance: 50 },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.payload.initialBalance).toBe('100');
      expect(result.payload.balanceData).toEqual({ balance: 50 });
      expect(result.payload.selectedColor).toBe('#7DD3A8');
      expect(result.payload.metadata).toBeUndefined();
    });

    it('clears balance fields for category accounts', () => {
      const result = buildAccountSavePayload({
        accountName: 'Groceries',
        accountType: AccountType.EXPENSE,
        accountSubtype: AccountSubtype.FOOD,
        selectedCurrency: 'USD',
        selectedIcon: 'tag',
        selectedColor: '',
        initialBalance: '99',
        parentAccountId: EMPTY_ACCOUNT_ID,
        metadataValues: baseMetadata,
        hasExistingMetadata: false,
        balanceData: { balance: 10 },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.payload.initialBalance).toBe('');
      expect(result.payload.balanceData).toBeUndefined();
      expect(result.payload.metadata).toBeUndefined();
    });

    it('builds payload for category converted to liability account', () => {
      const liabilityMetadata = {
        ...baseMetadata,
        creditLimitAmount: '5000',
      };
      const result = buildAccountSavePayload({
        accountName: 'Converted Credit Card',
        accountType: AccountType.LIABILITY,
        accountSubtype: AccountSubtype.CREDIT_CARD,
        selectedCurrency: 'USD',
        selectedIcon: 'creditCard',
        selectedColor: '',
        initialBalance: '0',
        parentAccountId: EMPTY_ACCOUNT_ID,
        metadataValues: liabilityMetadata,
        hasExistingMetadata: false,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.payload.accountType).toBe(AccountType.LIABILITY);
      expect(result.payload.accountSubtype).toBe(AccountSubtype.CREDIT_CARD);
      expect(result.payload.initialBalance).toBe('0');
      expect(result.payload.metadata).toBeDefined();
      expect(result.payload.metadata?.creditLimitAmount).toBe(5000);
    });
  });
});
