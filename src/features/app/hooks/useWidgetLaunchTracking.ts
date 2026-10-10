import { analytics } from '@/src/services/analytics';
import { logger } from '@/src/utils/logger';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

// Custom-scheme links carry the route in the URL hostname, so Linking.parse returns
// no path for either `scheme://?…` or `scheme://journal-entry?…`.
const WIDGET_LINK = /^[a-z][\w+.-]*:\/\/([^?#]*)\?(?:[^#]*&)?source=widget(?:[&#]|$)/i;

export function trackWidgetLaunch(url: string | null): void {
  const match = url ? WIDGET_LINK.exec(url) : null;
  if (!match) return;
  const screen = match[1].replace(/^\/+|\/+$/g, '') || 'index';
  analytics.track('entrypoint_opened', { screen, entrypoint: 'widget' });
}

/** Records app opens from a home-screen widget, on cold start and while running. */
export function useWidgetLaunchTracking(): void {
  useEffect(() => {
    Linking.getInitialURL()
      .then(trackWidgetLaunch)
      .catch(error => logger.warn('[useWidgetLaunchTracking] Initial URL unavailable', { error }));
    const subscription = Linking.addEventListener('url', ({ url }) => trackWidgetLaunch(url));
    return () => subscription.remove();
  }, []);
}
