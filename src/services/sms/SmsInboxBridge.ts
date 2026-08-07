import ExpoSmsInboxModule, { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import { getE2eSmsInboxMessages } from '@/src/testing/e2eSmsInject';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { PermissionError } from '@/src/utils/errors';
import { PermissionsAndroid, Platform } from 'react-native';

export class SmsInboxBridge {
  async getLatestMessages(
    limit: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsMessage[]> {
    if (Platform.OS !== 'android') {
      throw new Error('Reading SMS is only supported on Android.');
    }

    const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (!hasPermission) {
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
}

export const smsInboxBridge = new SmsInboxBridge();
