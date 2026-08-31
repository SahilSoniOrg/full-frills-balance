/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { element, by } from 'detox';
import { assertTextVisible, assertVisibleById } from '../../actions/assertions';
import { launchOnboardedApp, launchPickerApp, waitForDashboard } from '../../actions/launch';
import { dashboard } from '../../screens';

jest.setTimeout(180000);

describe('Smoke', () => {
  it('launches to the dashboard when seeded onboarded', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await assertVisibleById(dashboard.screen, 120000);
  });

  it('shows the workplace picker when multiple workplaces exist', async () => {
    await launchPickerApp();
    await assertTextVisible("E2E User's Personal workplace", 30000);
    await assertVisibleById('workplace-picker-create', 30000);
    await assertVisibleById('workplace-picker-import', 30000);
    await element(by.text("E2E User's Personal workplace")).tap();
    await waitForDashboard(120000);
  });

  it('routes picker actions to the correct setup flows', async () => {
    await launchPickerApp();
    await element(by.id('workplace-picker-create')).tap();
    await assertVisibleById('workplace-name-input', 30000);

    await launchPickerApp();
    await element(by.id('workplace-picker-import')).tap();
    await assertTextVisible(
      'Create a new Workplace from this backup. Existing Workplaces will not be changed.',
      30000,
    );
  });
});
