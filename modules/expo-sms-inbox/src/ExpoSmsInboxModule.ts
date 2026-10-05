import { NativeModule, requireOptionalNativeModule } from 'expo';

import { SmsMessage } from './ExpoSmsInbox.types';

declare class ExpoSmsInboxModule extends NativeModule {
  getSmsInbox(limit: number): Promise<SmsMessage[]>;
  getSmsInboxAfterId(afterId: string, limit: number): Promise<SmsMessage[]>;
  getSmsInboxBefore(beforeDate: number, beforeId: string, limit: number): Promise<SmsMessage[]>;
  getLatestSmsId(): Promise<string | null>;
  setAutomaticImportEnabled(enabled: boolean): Promise<void>;
}

export default requireOptionalNativeModule<ExpoSmsInboxModule>('ExpoSmsInbox');
