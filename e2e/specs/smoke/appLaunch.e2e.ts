/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { element, by } from 'detox';
import { assertTextVisible, assertVisibleById } from '../../actions/assertions';
import { launchOnboardedApp, launchPickerApp } from '../../actions/launch';
import { smokeScenarios, type SmokeDriver } from '../../scenarios/smoke';

jest.setTimeout(180000);

const driver: SmokeDriver = {
  launch: profile =>
    profile === 'picker-ready' ? launchPickerApp() : launchOnboardedApp({ seedProfile: profile }),
  visibleId: id => assertVisibleById(id, 120000),
  visibleText: text => assertTextVisible(text, 30000),
  tapId: id => element(by.id(id)).tap(),
  tapText: text => element(by.text(text)).tap(),
};

describe('Smoke', () => {
  for (const scenario of smokeScenarios) {
    it(scenario.name, () => scenario.run(driver));
  }
});
