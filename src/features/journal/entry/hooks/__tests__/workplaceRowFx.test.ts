import { AccountType, TransactionType } from '@/src/types/enums';
import { EMPTY_ACCOUNT_ID, asTransactionId } from '@/src/types/ids';
import { buildWorkplaceRowFx } from '../workplaceRowFx';

function line(
  overrides: { amount?: string; accountCurrency?: string; exchangeRate?: string } = {},
) {
  return {
    id: asTransactionId('1'),
    accountId: EMPTY_ACCOUNT_ID,
    accountName: '',
    accountType: AccountType.ASSET,
    amount: overrides.amount ?? '100',
    transactionType: TransactionType.CREDIT,
    notes: '',
    exchangeRate: overrides.exchangeRate ?? '',
    accountCurrency: overrides.accountCurrency,
  };
}

describe('buildWorkplaceRowFx', () => {
  it('hides a rate card when the row currency is the workplace currency', () => {
    const fx = buildWorkplaceRowFx(line({ accountCurrency: 'USD' }), 'USD');
    expect(fx.pair.isCrossCurrency).toBe(false);
    expect(fx.inputCurrency).toBe('USD');
    expect(fx.inputAmount).toBe('100');
  });

  it('converts a foreign row into the workplace currency with the stored rate', () => {
    const fx = buildWorkplaceRowFx(
      line({ amount: '40', accountCurrency: 'EUR', exchangeRate: '1.25' }),
      'USD',
    );
    expect(fx.pair.isCrossCurrency).toBe(true);
    expect(fx.inputCurrency).toBe('EUR');
    expect(fx.pair.convertedAmount).toBeCloseTo(50);
    expect(fx.pair.destCurrency).toBe('USD');
  });

  it('waits for a rate when a foreign row has none yet', () => {
    const fx = buildWorkplaceRowFx(line({ accountCurrency: 'EUR' }), 'USD');
    expect(fx.pair.isLoading).toBe(true);
    expect(fx.pair.convertedAmount).toBeNull();
  });
});
