import { NativeModule, requireOptionalNativeModule } from 'expo';

import { ExpoSmsInboxModuleEvents, SmsMessage } from './ExpoSmsInbox.types';

declare class ExpoSmsInboxModule extends NativeModule<ExpoSmsInboxModuleEvents> {
  getSmsInbox(limit: number): Promise<SmsMessage[]>;
}

// This call loads the native module object from the JSI.
export default requireOptionalNativeModule<ExpoSmsInboxModule>('ExpoSmsInbox');
