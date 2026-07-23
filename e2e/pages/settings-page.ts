import { BasePage } from './base-page';

export class SettingsPage extends BasePage {
  async factoryReset() {
    const resetButton = this.page.getByTestId('factory-reset-button');
    if ((await resetButton.count()) > 0) {
      await resetButton.click({ force: true });
    } else {
      await this.page.getByText('Factory Reset', { exact: true }).click({ force: true });
    }
  }

  async togglePrivacyMode() {
    await this.page.getByText('Privacy Mode').click();
  }
}
