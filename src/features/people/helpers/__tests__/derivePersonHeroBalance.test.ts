import { asPersonId } from '@/src/types/ids';
import { derivePersonHeroBalance } from '../derivePersonHeroBalance';
import { filterActivePersonCurrencies } from '../filterActivePersonCurrencies';

describe('filterActivePersonCurrencies', () => {
  it('keeps only non-zero currency rows', () => {
    expect(
      filterActivePersonCurrencies([
        { currencyCode: 'USD', owedToYou: 0, youOwe: 0, net: 0 },
        { currencyCode: 'INR', owedToYou: 10, youOwe: 0, net: 10 },
      ]),
    ).toEqual([{ currencyCode: 'INR', owedToYou: 10, youOwe: 0, net: 10 }]);
  });
});

describe('derivePersonHeroBalance', () => {
  it('labels a one-sided receivable as person owes you', () => {
    const result = derivePersonHeroBalance(
      {
        personId: asPersonId('ari'),
        currencies: [{ currencyCode: 'USD', owedToYou: 8, youOwe: 0, net: 8 }],
      },
      'Ari',
    );
    expect(result).toMatchObject({
      settled: false,
      oneSided: true,
      multiCurrency: false,
      balanceLabel: 'Ari owes you',
      heroAmount: 8,
      heroCurrency: 'USD',
      heroColor: 'income',
    });
  });

  it('labels a one-sided payable as you owe person', () => {
    const result = derivePersonHeroBalance(
      {
        personId: asPersonId('ari'),
        currencies: [{ currencyCode: 'USD', owedToYou: 0, youOwe: 5, net: -5 }],
      },
      'Ari',
    );
    expect(result).toMatchObject({
      settled: false,
      oneSided: true,
      balanceLabel: 'You owe Ari',
      heroAmount: 5,
      heroColor: 'expense',
    });
  });

  it('marks zero balances as settled', () => {
    const result = derivePersonHeroBalance(
      { personId: asPersonId('ari'), currencies: [] },
      'Ari',
      'INR',
    );
    expect(result).toMatchObject({
      settled: true,
      balanceLabel: 'Balance',
      heroAmount: 0,
      heroCurrency: 'INR',
      heroColor: 'income',
    });
  });

  it('uses net label when both directions are open', () => {
    const result = derivePersonHeroBalance(
      {
        personId: asPersonId('ari'),
        currencies: [{ currencyCode: 'USD', owedToYou: 8, youOwe: 2, net: 6 }],
      },
      'Ari',
    );
    expect(result).toMatchObject({
      oneSided: false,
      balanceLabel: 'Net',
      heroAmount: 6,
      heroColor: 'income',
    });
  });

  it('flags multi-currency summaries', () => {
    const result = derivePersonHeroBalance(
      {
        personId: asPersonId('ari'),
        currencies: [
          { currencyCode: 'USD', owedToYou: 8, youOwe: 0, net: 8 },
          { currencyCode: 'INR', owedToYou: 0, youOwe: 100, net: -100 },
        ],
      },
      'Ari',
    );
    expect(result.multiCurrency).toBe(true);
    expect(result.primary).toBeNull();
    expect(result.settled).toBe(true);
  });
});
