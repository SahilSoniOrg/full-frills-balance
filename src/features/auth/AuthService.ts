import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { supabase } from '@/src/services/supabase';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export class AuthService {
  constructor() {
    this.init();
  }

  private init() {
    // Sync initial state
    supabase.auth.getSession().then(({ data: { session } }) => {
      this.handleAuthChange('INITIAL_SESSION', session);
    });

    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      this.handleAuthChange(event, session);
    });
  }

  private handleAuthChange(event: string, session: Session | null) {
    logger.info(`Supabase Auth Event: ${event}`);

    if (session?.user) {
      this.syncUserToPreferences(session.user);
    } else if (event === 'SIGNED_OUT') {
      this.clearUserFromPreferences();
    }
  }

  private syncUserToPreferences(user: User) {
    preferences.setCurrentUser({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
    });
    preferences.setIdentityState('READY');
  }

  private clearUserFromPreferences() {
    preferences.setCurrentUser(null);
    preferences.setIdentityState('NOT_CREATED');
  }

  getCurrentUser(): User | null {
    // Supabase auth handles session synchronously if loaded
    return null; // Will be handled properly in AuthContext or async
  }

  onAuthStateChanged(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback);
  }

  async signInWithEmail(email: string) {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      logger.error('Failed to sign in with email', { error });
      throw error;
    }
  }

  async verifyOtp(email: string, token: string) {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Failed to verify OTP', { error });
      throw error;
    }
  }

  private async performOAuthSignIn(provider: 'google' | 'apple') {
    // Hardcoding the exact scheme instead of using Linking.createURL()
    // This prevents the Expo Dev Client from mangling the URL into 'exp+fullfrillsbalance://...?url=...'
    // which strips the Supabase access_token hash fragment!
    const redirectUrl = 'fullfrillsbalance://auth/callback';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) throw error;

    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        // Extract session from URL manually without expo-auth-session
        const queryString = result.url.split('#')[1] || result.url.split('?')[1] || '';
        const params = new URLSearchParams(queryString);

        const errorCode = params.get('error_description') || params.get('error');
        if (errorCode) throw new Error(errorCode);

        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) throw sessionError;
        }
      } else if (result.type === 'cancel') {
        throw new Error('Sign in was canceled');
      }
    }
    return data;
  }

  async signInWithGoogle() {
    try {
      return await this.performOAuthSignIn('google');
    } catch (error) {
      logger.error('Failed to sign in with Google', { error });
      throw error;
    }
  }

  async signInWithApple() {
    try {
      return await this.performOAuthSignIn('apple');
    } catch (error) {
      logger.error('Failed to sign in with Apple', { error });
      throw error;
    }
  }

  async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      logger.error('Failed to sign out', { error });
      throw error;
    }
  }
}

export const authService = new AuthService();
