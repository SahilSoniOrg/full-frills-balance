import { useAiPrefs } from '@/src/hooks/useAiPrefs';
import { useNotificationPrefs } from '@/src/hooks/useNotificationPrefs';
import { useSmsPrefs } from '@/src/hooks/useSmsPrefs';
import { analytics } from '@/src/services/analytics-service';
import { modelManagementService } from '@/src/services/ai/ModelManagementService';
import { AIModelMetadata } from '@/src/services/ai/types';
import {
  notificationService,
  NotificationCadence,
} from '@/src/services/notification/NotificationService';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface NotificationSettingsViewModel {
  notificationCadence: NotificationCadence;
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number;
  onUpdateNotificationCadence: (cadence: NotificationCadence) => Promise<void>;
  onUpdateNotificationTime: (hour: number, minute: number, weekday?: number) => Promise<void>;
  onSendTestNotification: () => void;
  isSmsImportEnabled: boolean;
  setIsSmsImportEnabled: (enabled: boolean) => void;
  isNativeAiEnabled: boolean;
  setIsNativeAiEnabled: (enabled: boolean) => void;
  preferredAiModelId?: string;
  setPreferredAiModelId: (modelId: string) => void;
  aiInferenceMode: 'single' | 'multi';
  setAiInferenceMode: (mode: 'single' | 'multi') => void;
  downloadedModels: AIModelMetadata[];
  onOpenInbox: () => void;
  onOpenSmsRules: () => void;
  onOpenAiLab: () => void;
}

export function useNotificationSettingsViewModel(): NotificationSettingsViewModel {
  const {
    notificationCadence,
    notificationHour,
    notificationMinute,
    notificationWeekday,
    setNotificationCadence,
    setNotificationTime,
    setNotificationWeekday,
  } = useNotificationPrefs();
  const { isSmsImportEnabled, setIsSmsImportEnabled } = useSmsPrefs();
  const {
    isNativeAiEnabled,
    setIsNativeAiEnabled,
    preferredAiModelId,
    setPreferredAiModelId,
    aiInferenceMode,
    setAiInferenceMode,
  } = useAiPrefs();
  const [downloadedModels, setDownloadedModels] = useState<AIModelMetadata[]>([]);
  const notificationUpdateGenerationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const checkModels = async () => {
      const allModels = modelManagementService.getAllModels();
      const downloaded: AIModelMetadata[] = [];
      for (const model of allModels) {
        const status = await modelManagementService.getDownloadStatus(model.id);
        if (status.isDownloaded) {
          downloaded.push(model);
        }
      }
      if (!cancelled) {
        setDownloadedModels(downloaded);
      }
    };

    checkModels();

    return () => {
      cancelled = true;
    };
  }, [isNativeAiEnabled]);

  const onUpdateNotificationCadence = useCallback(
    async (cadence: NotificationCadence) => {
      const generation = ++notificationUpdateGenerationRef.current;
      if (cadence !== 'none') {
        const granted = await notificationService.requestPermissions();
        if (!granted || generation !== notificationUpdateGenerationRef.current) return;
      }
      setNotificationCadence(cadence);
      analytics.logNotificationPreferenceChanged(cadence, notificationHour);
      await notificationService.scheduleReminder(
        cadence,
        notificationHour,
        notificationMinute,
        notificationWeekday,
      );
      analytics.trackFeatureUsage('settings', 'change_notification_cadence', { cadence });
    },
    [setNotificationCadence, notificationHour, notificationMinute, notificationWeekday],
  );

  const onUpdateNotificationTime = useCallback(
    async (hour: number, minute: number, weekday?: number) => {
      ++notificationUpdateGenerationRef.current;
      setNotificationTime(hour, minute);
      if (weekday !== undefined) {
        setNotificationWeekday(weekday);
      }
      await notificationService.scheduleReminder(
        notificationCadence,
        hour,
        minute,
        weekday ?? notificationWeekday,
      );
      analytics.trackFeatureUsage('settings', 'change_notification_time', {
        hour,
        minute,
        weekday: weekday ?? notificationWeekday,
      });
    },
    [setNotificationTime, setNotificationWeekday, notificationCadence, notificationWeekday],
  );

  const handleSetIsSmsImportEnabled = useCallback(
    (enabled: boolean) => {
      setIsSmsImportEnabled(enabled);
      analytics.logSmsImportSettingsChanged(enabled);
      analytics.trackFeatureUsage('settings', 'toggle_sms_import', { enabled });
    },
    [setIsSmsImportEnabled],
  );

  return {
    notificationCadence,
    notificationHour,
    notificationMinute,
    notificationWeekday,
    onUpdateNotificationCadence,
    onUpdateNotificationTime,
    onSendTestNotification: () => notificationService.sendImmediateTest(),
    isSmsImportEnabled,
    setIsSmsImportEnabled: handleSetIsSmsImportEnabled,
    isNativeAiEnabled,
    setIsNativeAiEnabled,
    preferredAiModelId,
    setPreferredAiModelId,
    aiInferenceMode,
    setAiInferenceMode,
    downloadedModels,
    onOpenInbox: AppNavigation.toTransactionInbox,
    onOpenSmsRules: AppNavigation.toSmsRules,
    onOpenAiLab: AppNavigation.toAiExample,
  };
}
