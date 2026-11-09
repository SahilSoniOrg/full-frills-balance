import { Platform } from 'react-native';
import gmailBackgroundAuth from '@/modules/expo-gmail-auth';

const GMAIL_READ_ONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

async function google() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Gmail is available on iOS and Android.');
  }
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!webClientId || (Platform.OS === 'ios' && !iosClientId)) {
    throw new Error('Gmail sign-in is not configured for this build.');
  }
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({
    webClientId,
    ...(iosClientId ? { iosClientId } : {}),
    scopes: [GMAIL_READ_ONLY_SCOPE],
    offlineAccess: false,
  });
  return GoogleSignin;
}

/** Called only following the user's explicit Connect Gmail action. */
export async function connectGmail(): Promise<{ accountId: string } | null> {
  const client = await google();
  if (Platform.OS === 'android')
    await client.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await client.signIn();
  if (result.type !== 'success') return null;
  if (!result.data.scopes.includes(GMAIL_READ_ONLY_SCOPE)) {
    const grant = await client.addScopes({ scopes: [GMAIL_READ_ONLY_SCOPE] });
    if (!grant || grant.type !== 'success' || !grant.data.scopes.includes(GMAIL_READ_ONLY_SCOPE))
      return null;
  }
  return { accountId: result.data.user.id };
}

/** Credentials remain in the platform sign-in SDK, never in logs or exported preferences. */
export async function gmailAccessToken(backgroundAccountId?: string): Promise<{
  accessToken: string;
  accountId: string;
  email: string;
} | null> {
  if (Platform.OS === 'android' && backgroundAccountId) {
    if (!gmailBackgroundAuth)
      throw new Error('Background Gmail authorization is unavailable in this build.');
    const credentials = await gmailBackgroundAuth.getBackgroundToken(backgroundAccountId);
    return { ...credentials, accountId: backgroundAccountId };
  }
  const client = await google();
  const result = await client.signInSilently();
  if (result.type !== 'success' || !result.data.scopes.includes(GMAIL_READ_ONLY_SCOPE)) return null;
  return {
    accessToken: (await client.getTokens()).accessToken,
    accountId: result.data.user.id,
    email: result.data.user.email,
  };
}

/** Android can return a cached expired access token; invalidate it before one retry. */
export async function invalidateGmailAccessToken(accessToken: string): Promise<void> {
  if (Platform.OS === 'android') {
    const client = await google();
    await client.clearCachedAccessToken(accessToken);
  }
}

/** Called only after the last Workplace disconnects; revoke first, then clear local sign-in. */
export async function disconnectGmail(): Promise<boolean> {
  let client: Awaited<ReturnType<typeof google>>;
  try {
    client = await google();
  } catch {
    return false;
  }
  let revoked = false;
  try {
    await client.revokeAccess();
    revoked = true;
  } catch {
    // Local disconnection still succeeds; the user can revoke access in Google Account settings.
  }
  try {
    await client.signOut();
  } catch {
    // Do not leave the app's local Workplace connection in place if sign-out fails.
  }
  return revoked;
}
