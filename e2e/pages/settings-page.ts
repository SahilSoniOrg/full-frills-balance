import { BasePage } from './base-page';

export class SettingsPage extends BasePage {
    async factoryReset() {
        await this.page.getByText('Factory Reset', { exact: true }).click();

        // On Web, window.confirm is handled by the page.on('dialog') listener in the test.
        // On Native, we would need to click "RESET EVERYTHING" in the Alert.
        // Since Playwright runs on Web, we skip the native alert interaction.
    }

    async togglePrivacyMode() {
        await this.page.getByText('Privacy Mode').click();
    }
}
