import { dashboard } from '../screens';

/** The scenario owns the user journey; each runner owns launch and UI operations. */
export interface SmokeDriver {
  launch(profile: 'onboarded' | 'picker-ready'): Promise<void>;
  visibleId(id: string): Promise<void>;
  visibleText(text: string): Promise<void>;
  tapId(id: string): Promise<void>;
  tapText(text: string): Promise<void>;
}

export const smokeScenarios: readonly {
  name: string;
  run(driver: SmokeDriver): Promise<void>;
}[] = [
  {
    name: 'launches to the dashboard when seeded onboarded',
    async run(driver) {
      await driver.launch('onboarded');
      await driver.visibleId(dashboard.screen);
    },
  },
  {
    name: 'shows the workplace picker when multiple workplaces exist',
    async run(driver) {
      await driver.launch('picker-ready');
      await driver.visibleText("E2E User's Personal workplace");
      await driver.visibleId('workplace-picker-create');
      await driver.visibleId('workplace-picker-import');
      await driver.tapText("E2E User's Personal workplace");
      await driver.visibleId(dashboard.screen);
    },
  },
  {
    name: 'routes picker actions to the correct setup flows',
    async run(driver) {
      await driver.launch('picker-ready');
      await driver.tapId('workplace-picker-create');
      await driver.visibleId('workplace-name-input');
      await driver.launch('picker-ready');
      await driver.tapId('workplace-picker-import');
      await driver.visibleId('restore-source-slice');
      await driver.visibleText('Choose a backup format to replace the data on this device.');
    },
  },
];
