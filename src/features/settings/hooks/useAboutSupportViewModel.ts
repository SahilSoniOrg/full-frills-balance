import { analytics } from '@/src/services/analytics-service';
import { BugReportService } from '@/src/services/BugReportService';
import { useCallback } from 'react';
import { Linking } from 'react-native';

export type AboutSupportViewModel = ReturnType<typeof useAboutSupportViewModel>;

export function useAboutSupportViewModel() {
  const onOpenTelegram = useCallback(() => {
    analytics.trackFeatureUsage('settings', 'open_telegram');
    Linking.openURL('https://t.me/FullFrills');
  }, []);

  const onOpenPlayStore = useCallback(() => {
    analytics.trackFeatureUsage('settings', 'open_play_store');
    Linking.openURL('https://play.google.com/store/apps/details?id=in.sahilsoni.fullfrillsbalance');
  }, []);

  const onOpenGithub = useCallback(() => {
    analytics.trackFeatureUsage('settings', 'open_github');
    Linking.openURL('https://github.com/SahilSoniOrg/full-frills-balance');
  }, []);

  const onShareBugReport = useCallback(() => {
    analytics.trackFeatureUsage('settings', 'share_bug_report');
    BugReportService.shareReport();
  }, []);

  const onSaveBugReport = useCallback(() => {
    analytics.trackFeatureUsage('settings', 'save_bug_report');
    BugReportService.saveReport();
  }, []);

  return {
    onOpenTelegram,
    onOpenPlayStore,
    onOpenGithub,
    onShareBugReport,
    onSaveBugReport,
  };
}
