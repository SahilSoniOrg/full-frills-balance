import ExpoSmsInboxModule, { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import { getE2eSmsInboxMessages } from '@/src/testing/e2eSmsInject';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { confirm } from '@/src/utils/alerts';
import { PermissionError } from '@/src/utils/errors';
import { PermissionsAndroid, Platform } from 'react-native';

export class SmsInboxBridge {
  async hasReadPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  }

  async hasAutomaticImportPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    const [canRead, canReceive] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS),
    ]);
    return canRead && canReceive;
  }

  async requestAutomaticImportPermissions(): Promise<
    'granted' | 'denied' | 'never_ask_again' | 'cancelled'
  > {
    if (Platform.OS !== 'android') return 'denied';
    if (!(await this.showAutomaticImportDisclosure())) return 'cancelled';

    const permissions = [
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ];
    const rationale = {
      title: 'Allow automatic SMS import',
      message:
        'When enabled, Full Frills Balance checks every incoming SMS on this device to find transactions. Messages are analyzed locally, and their text is not sent to our servers.',
      buttonPositive: 'Allow',
      buttonNegative: AppConfig.strings.common.cancel,
    };
    for (const permission of permissions) {
      if (await PermissionsAndroid.check(permission)) continue;
      const result = await PermissionsAndroid.request(permission, rationale);
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'never_ask_again';
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return 'denied';
    }
    return 'granted';
  }

  private async showAutomaticImportDisclosure(): Promise<boolean> {
    return new Promise(resolve => {
      confirm.show({
        title: 'Enable automatic SMS import?',
        message:
          'The first time you enable this, the app checks up to 50 recent inbox messages. After that, while it is on, it reads every incoming SMS, including unrelated messages, even when the app is closed. It checks messages on this device and does not send SMS text to our servers. You can turn this off anytime.',
        confirmText: 'Continue',
        cancelText: AppConfig.strings.common.cancel,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
        onClose: () => resolve(false),
      });
    });
  }

  async getLatestMessages(
    limit: number = AppConfig.pagination.smsImportScanLimit,
    promptForPermission = true,
  ): Promise<SmsMessage[]> {
    if (Platform.OS !== 'android') {
      throw new Error('Reading SMS is only supported on Android.');
    }

    let hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (!hasPermission && promptForPermission) {
      const accepted = await new Promise<boolean>(resolve => {
        confirm.show({
          title: 'Allow SMS inbox import?',
          message:
            'When you start an import, Full Frills Balance scans SMS messages on this device for transactions. Unrelated messages may be checked and ignored. SMS text stays on this device.',
          confirmText: 'Continue',
          cancelText: AppConfig.strings.common.cancel,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
          onClose: () => resolve(false),
        });
      });
      if (!accepted) throw new PermissionError('SMS inbox import disclosure was declined.');

      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
        title: 'SMS Permission',
        message:
          'Full Frills Balance needs access to read your SMS to import transactions securely.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: AppConfig.strings.common.cancel,
        buttonPositive: 'OK',
      });

      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new PermissionError('READ_SMS permission denied by user.');
      }
      hasPermission = true;
    }
    if (!hasPermission) {
      throw new PermissionError('READ_SMS permission is required to scan SMS messages.');
    }

    if (!ExpoSmsInboxModule) {
      throw new Error('ExpoSmsInbox module is not available');
    }

    const e2eConfig = readE2eLaunchConfig();
    if (e2eConfig) {
      const injected = getE2eSmsInboxMessages();
      if (injected.length > 0) {
        return injected.slice(0, limit);
      }
    }

    return ExpoSmsInboxModule.getSmsInbox(limit);
  }

  async getLatestSmsId(): Promise<string | null> {
    await this.assertAndroidReadPermission();
    if (!ExpoSmsInboxModule) throw new Error('ExpoSmsInbox module is not available');
    return ExpoSmsInboxModule.getLatestSmsId();
  }

  async getMessagesAfterId(afterId: string, limit: number): Promise<SmsMessage[]> {
    await this.assertAndroidReadPermission();
    if (!ExpoSmsInboxModule) throw new Error('ExpoSmsInbox module is not available');
    return ExpoSmsInboxModule.getSmsInboxAfterId(afterId, limit);
  }

  async getOlderMessages(
    before: { date: number; id: string },
    limit: number,
  ): Promise<SmsMessage[]> {
    await this.assertAndroidReadPermission();
    if (!ExpoSmsInboxModule) throw new Error('ExpoSmsInbox module is not available');
    return ExpoSmsInboxModule.getSmsInboxBefore(before.date, before.id, limit);
  }

  async setAutomaticImportEnabled(enabled: boolean): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (!ExpoSmsInboxModule) throw new Error('ExpoSmsInbox module is not available');
    await ExpoSmsInboxModule.setAutomaticImportEnabled(enabled);
  }

  private async assertAndroidReadPermission(): Promise<void> {
    if (Platform.OS !== 'android') throw new Error('Reading SMS is only supported on Android.');
    if (!(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS))) {
      throw new PermissionError('READ_SMS permission is required to scan SMS messages.');
    }
  }
}

export const smsInboxBridge = new SmsInboxBridge();
