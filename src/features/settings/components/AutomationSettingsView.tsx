import { SelectionPickerSheet } from '@/src/components/common/SelectionPickerSheet';
import { AppSegmentedControl, AppText, AppToggle } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { NotificationPreferenceView } from '@/src/features/settings/components/NotificationPreferenceView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { NotificationSettingsViewModel } from '@/src/features/settings/hooks/useNotificationSettingsViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { useState } from 'react';
import { Platform } from 'react-native';

interface AutomationSettingsViewProps {
  vm: NotificationSettingsViewModel;
}

export function AutomationSettingsView({ vm }: AutomationSettingsViewProps) {
  const [isModelPickerVisible, setIsModelPickerVisible] = useState(false);

  const modelOptions = vm.downloadedModels.map(m => ({
    id: m.id,
    label: m.name,
    description: `${m.parameters} • ${m.quantization}`,
  }));

  const activeModel =
    vm.downloadedModels.find(m => m.id === vm.preferredAiModelId) ||
    vm.downloadedModels.find(m => m.id === AppConfig.defaults.defaultAiModelId) ||
    vm.downloadedModels[0];

  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.remindersAndAutomation}>
      <Stack space="xl">
        <SettingsMenu header={AppConfig.strings.settings.notifications.title} hideSeparator>
          <SettingsMenuItem
            leftIcon="notifications"
            title={AppConfig.strings.settings.notifications.title}
            description={AppConfig.strings.settings.notifications.description}
            hasArrow={false}
          />
          <NotificationPreferenceView
            cadence={vm.notificationCadence}
            hour={vm.notificationHour}
            minute={vm.notificationMinute}
            weekday={vm.notificationWeekday}
            onUpdateCadence={vm.onUpdateNotificationCadence}
            onUpdateTime={vm.onUpdateNotificationTime}
            onSendTest={vm.onSendTestNotification}
          />
        </SettingsMenu>

        {Platform.OS === 'android' && (
          <SettingsMenu header={AppConfig.strings.settings.personalization.smsAutomationHeader}>
            <SettingsMenuItem
              leftIcon="zap"
              title={AppConfig.strings.settings.personalization.smsImportTitle}
              description="Automatically scan for transaction messages"
              hasArrow={false}
              rightContent={
                <AppToggle value={vm.isSmsImportEnabled} onValueChange={vm.setIsSmsImportEnabled} />
              }
            />
            <SettingsMenuItem
              leftIcon="messageSquare"
              title={AppConfig.strings.settings.personalization.smsInboxTitle}
              description={AppConfig.strings.settings.personalization.smsInboxDesc}
              onPress={AppNavigation.toTransactionInbox}
              testID="settings-sms-inbox"
            />
            {vm.isSmsImportEnabled && (
              <>
                <SettingsMenuItem
                  leftIcon="terminal"
                  title={AppConfig.strings.settings.personalization.smsAutoPostTitle}
                  description={AppConfig.strings.settings.personalization.smsAutoPostDesc}
                  onPress={AppNavigation.toSmsRules}
                />
              </>
            )}
          </SettingsMenu>
        )}

        <SettingsMenu header="Voice AI Ingestion">
          <SettingsMenuItem
            leftIcon="mic"
            title="Local AI Fallback"
            description="Use on-device LLM when deterministic parsing fails"
            hasArrow={false}
            rightContent={
              <AppToggle value={vm.isNativeAiEnabled} onValueChange={vm.setIsNativeAiEnabled} />
            }
          />

          {vm.isNativeAiEnabled && (
            <>
              <SettingsMenuItem
                leftIcon="activity"
                title="Inference Mode"
                description="Choose between speed or accuracy"
                hasArrow={false}
                rightContent={
                  <AppSegmentedControl
                    value={vm.aiInferenceMode}
                    onChange={vm.setAiInferenceMode}
                    options={[
                      { id: 'single', label: 'Fast' },
                      { id: 'multi', label: 'Accurate' },
                    ]}
                    size="sm"
                    itemWidth={80}
                  />
                }
              />
              {modelOptions.length > 0 && (
                <SettingsMenuItem
                  leftIcon="database"
                  title="Active Model"
                  description={activeModel?.name || 'Choose which model to use'}
                  onPress={() => setIsModelPickerVisible(true)}
                  rightContent={
                    <AppText variant="caption" weight="bold" color="primary">
                      {activeModel ? activeModel.parameters : 'Select'}
                    </AppText>
                  }
                />
              )}
            </>
          )}

          <SettingsMenuItem
            leftIcon="zap"
            title="AI Dev Lab"
            description="Chat and benchmark litert-lm on-device"
            onPress={AppNavigation.toAiExample}
          />
        </SettingsMenu>

        <SelectionPickerSheet
          visible={isModelPickerVisible}
          title="Select Active Model"
          options={modelOptions}
          selectedValue={vm.preferredAiModelId || AppConfig.defaults.defaultAiModelId}
          onClose={() => setIsModelPickerVisible(false)}
          onSelect={vm.setPreferredAiModelId}
        />
      </Stack>
    </SettingsLayout>
  );
}
