import { NativeModule, requireOptionalNativeModule } from 'expo';

import { ExpoSmsInboxModuleEvents, SmsMessage } from './ExpoSmsInbox.types';

declare class ExpoSmsInboxModule extends NativeModule<ExpoSmsInboxModuleEvents> {
  getSmsInbox(limit: number): Promise<SmsMessage[]>;
  getSmsInboxAfterId(afterId: string, limit: number): Promise<SmsMessage[]>;
  getSmsInboxBefore(beforeDate: number, beforeId: string, limit: number): Promise<SmsMessage[]>;
  getLatestSmsId(): Promise<string | null>;
  setAutomaticImportEnabled(enabled: boolean): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireOptionalNativeModule<ExpoSmsInboxModule>('ExpoSmsInbox');
