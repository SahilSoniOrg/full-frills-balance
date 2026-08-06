import AccountMetadata from '@/src/data/models/AccountMetadata';
import { toLiabilityMetadata } from '@/src/services/simulation/liabilityMetadata';

describe('toLiabilityMetadata', () => {
  it('maps persisted min payment mode from minPaymentOnly only', () => {
    const metadata = {
      statementDay: 5,
      dueDay: 20,
      minimumPaymentAmount: 25,
      emiDay: 10,
      payFromAccountId: 'acct-1',
      minPaymentOnly: true,
      minimumPaymentPercent: 5,
    } as AccountMetadata;

    expect(toLiabilityMetadata(metadata)).toEqual({
      statementDay: 5,
      dueDay: 20,
      minimumPaymentAmount: 25,
      emiDay: 10,
      payFromAccountId: 'acct-1',
      minPaymentOnly: true,
      minimumPaymentPercent: 5,
    });
  });
});
