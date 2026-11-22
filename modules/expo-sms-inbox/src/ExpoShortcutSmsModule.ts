import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { SmsMessage } from './ExpoSmsInbox.types';

declare class ExpoShortcutSmsModule extends NativeModule {
  getPending(): Promise<SmsMessage[]>;
  acknowledge(id: string): Promise<void>;
  getStatus(): Promise<{ firstReceivedAt: number | null }>;
  invalidate(): Promise<void>;
  purgeRetired(): Promise<void>;
}

export default requireOptionalNativeModule<ExpoShortcutSmsModule>('ExpoShortcutSms');
