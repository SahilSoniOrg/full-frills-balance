import { useUI } from '@/src/contexts/UIContext';
import { analytics } from '@/src/services/analytics-service';
import { modelManagementService } from '@/src/services/ai/ModelManagementService';
import { AIModelMetadata } from '@/src/services/ai/types';
import {
  notificationService,
  NotificationCadence,
} from '@/src/services/notification/NotificationService';
import { useCallback, useEffect, useState } from 'react';

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
}

export function useNotificationSettingsViewModel(): NotificationSettingsViewModel {
  const ui = useUI();
  const {
    isSmsImportEnabled,
    setIsSmsImportEnabled,
    isNativeAiEnabled,
    setIsNativeAiEnabled,
    preferredAiModelId,
    setPreferredAiModelId,
    aiInferenceMode,
    setAiInferenceMode,
  } = ui;
  const [downloadedModels, setDownloadedModels] = useState<AIModelMetadata[]>([]);

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
      if (cadence !== 'none') {
        const granted = await notificationService.requestPermissions();
        if (!granted) return;
      }
      await ui.setNotificationCadence(cadence);
      await notificationService.scheduleReminder(
        cadence,
        ui.notificationHour,
        ui.notificationMinute,
        ui.notificationWeekday,
      );
      analytics.trackFeatureUsage('settings', 'change_notification_cadence', { cadence });
    },
    [ui],
  );

  const onUpdateNotificationTime = useCallback(
    async (hour: number, minute: number, weekday?: number) => {
      await ui.setNotificationTime(hour, minute);
      if (weekday !== undefined) {
        await ui.setNotificationWeekday(weekday);
      }
      await notificationService.scheduleReminder(
        ui.notificationCadence,
        hour,
        minute,
        weekday ?? ui.notificationWeekday,
      );
      analytics.trackFeatureUsage('settings', 'change_notification_time', {
        hour,
        minute,
        weekday: weekday ?? ui.notificationWeekday,
      });
    },
    [ui],
  );

  const handleSetIsSmsImportEnabled = useCallback(
    (enabled: boolean) => {
      setIsSmsImportEnabled(enabled);
      analytics.trackFeatureUsage('settings', 'toggle_sms_import', { enabled });
    },
    [setIsSmsImportEnabled],
  );

  return {
    notificationCadence: ui.notificationCadence,
    notificationHour: ui.notificationHour,
    notificationMinute: ui.notificationMinute,
    notificationWeekday: ui.notificationWeekday,
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
  };
}
