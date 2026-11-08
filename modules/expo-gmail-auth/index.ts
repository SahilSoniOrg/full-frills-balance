import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class ExpoGmailAuthModule extends NativeModule {
  getBackgroundToken(expectedAccountId: string): Promise<{ accessToken: string; email: string }>;
}

export default requireOptionalNativeModule<ExpoGmailAuthModule>('ExpoGmailAuth');
