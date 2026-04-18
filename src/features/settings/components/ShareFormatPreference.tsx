import { AppConfig } from '@/src/constants';
import { AppSegmentedControl } from '@/src/components/core/AppSegmentedControl';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { ShareFormat } from '@/src/types/sharing';
import React from 'react';

export const ShareFormatPreference = () => {
  const { defaultShareFormat, setDefaultShareFormat } = useSettingsViewModel();

  const options = [
    { id: ShareFormat.TEXT, label: AppConfig.strings.settings.data.shareFormats.TEXT },
    { id: ShareFormat.CSV, label: AppConfig.strings.settings.data.shareFormats.CSV },
    { id: ShareFormat.MARKDOWN, label: AppConfig.strings.settings.data.shareFormats.MARKDOWN },
  ];

  return (
    <SettingsMenuItem
      title={AppConfig.strings.settings.data.shareFormatTitle}
      description={AppConfig.strings.settings.data.shareFormatDesc}
      hasArrow={false}
      rightContent={
        <AppSegmentedControl
          options={options}
          value={defaultShareFormat}
          onChange={id => setDefaultShareFormat(id as ShareFormat)}
          size="sm"
          minWidth={72}
        />
      }
    />
  );
};
