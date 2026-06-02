import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/services/supabase';
import { logger } from '@/src/utils/logger';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const url = Linking.useURL();

  useEffect(() => {
    // Force close the web browser if it's stuck open
    WebBrowser.maybeCompleteAuthSession();
    WebBrowser.dismissBrowser();

    const processUrl = async () => {
      logger.info('[AuthCallback] processUrl triggered', { url });

      if (!url) {
        logger.warn('[AuthCallback] No URL provided to processUrl');
        return;
      }

      try {
        const queryString = url.split('#')[1] || url.split('?')[1] || '';
        const params = new URLSearchParams(queryString);

        logger.info('[AuthCallback] Parsed URL params', {
          hasAccessToken: !!params.get('access_token'),
          hasRefreshToken: !!params.get('refresh_token'),
          error: params.get('error_description') || params.get('error'),
          rawQueryLength: queryString.length,
        });

        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          logger.info('[AuthCallback] Setting session in Supabase...');
          const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });

          if (error) {
            logger.error('[AuthCallback] Supabase setSession failed', { error });
          } else {
            logger.info('[AuthCallback] Session successfully stored!', {
              userId: data.session?.user?.id,
            });
          }
        } else {
          logger.warn('[AuthCallback] Missing access_token or refresh_token in URL');
        }
      } catch (e) {
        logger.error('[AuthCallback] Failed to parse OAuth callback:', { error: e });
      } finally {
        logger.info('[AuthCallback] Redirecting to home (/)');
        router.replace('/');
      }
    };

    if (url) {
      processUrl();
    } else {
      logger.warn(
        '[AuthCallback] No initial URL detected, waiting 2 seconds before fallback redirect...',
      );
      // If there's no URL yet, fallback to redirecting after 2 seconds
      const timeout = setTimeout(() => {
        logger.warn(
          '[AuthCallback] 2 second timeout hit, redirecting to home without processing URL',
        );
        router.replace('/');
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [url, router]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0A0A0C',
      }}
    >
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}
