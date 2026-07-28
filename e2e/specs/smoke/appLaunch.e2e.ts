/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { assertVisibleById } from '../../actions/assertions';
import { launchOnboardedApp } from '../../actions/launch';
import { dashboard } from '../../screens';

jest.setTimeout(180000);

describe('Smoke', () => {
  it('launches to the dashboard when seeded onboarded', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await assertVisibleById(dashboard.screen, 120000);
  });
});
