/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { launchOnboardedApp } from '../../actions/launch';
import { createPlannedPayment } from '../../actions/mobile/flows';

jest.setTimeout(300000);

describe('Planned payments', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'planned-payments' });
  });

  it('creates a planned payment rule', async () => {
    await createPlannedPayment('Monthly Rent', '1500');
  });
});
