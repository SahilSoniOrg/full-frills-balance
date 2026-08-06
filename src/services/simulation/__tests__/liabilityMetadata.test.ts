import {
  toLiabilityMetadata,
  type LiabilityMetadataSource,
} from '@/src/services/simulation/liabilityMetadata';
import { AccountId } from '@/src/types/domain';

describe('toLiabilityMetadata', () => {
  it('maps persisted min payment mode from minPaymentOnly only', () => {
    const metadata: LiabilityMetadataSource = {
      statementDay: 5,
      dueDay: 20,
      minimumPaymentAmount: 25,
      emiDay: 10,
      payFromAccountId: 'acct-1' as AccountId,
      minPaymentOnly: true,
      minimumPaymentPercent: 5,
    };

    expect(toLiabilityMetadata(metadata)).toEqual({
      statementDay: 5,
      dueDay: 20,
      minimumPaymentAmount: 25,
      emiDay: 10,
      payFromAccountId: 'acct-1' as AccountId,
      minPaymentOnly: true,
      minimumPaymentPercent: 5,
    });
  });

  it('preserves runtime-only emiAmount from fixtures and test mocks', () => {
    const metadata: LiabilityMetadataSource = {
      emiDay: 20,
      payFromAccountId: 'acct-1' as AccountId,
      emiAmount: 350,
    };

    expect(toLiabilityMetadata(metadata)).toEqual({
      emiDay: 20,
      payFromAccountId: 'acct-1' as AccountId,
      emiAmount: 350,
    });
  });
});
