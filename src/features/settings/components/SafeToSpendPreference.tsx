import { AppSegmentedControl, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { Box, Stack } from '@/src/design-system';
import React from 'react';

export const SafeToSpendPreference = () => {
  const { safeToSpendDays, setSafeToSpendDays } = useUI();
  const strings = AppConfig.strings.settings.personalization;

  const options = [
    { id: 30, label: '30 Days' },
    { id: 60, label: '60 Days' },
  ] as const;

  return (
    <Stack space="md" paddingHorizontal="md" paddingVertical="md">
      <Stack space="xs">
        <AppText variant="body" weight="medium">
          {strings.forecastTitle}
        </AppText>
        <AppText variant="caption" color="secondary">
          {strings.forecastDesc}
        </AppText>
      </Stack>

      <Box>
        <AppSegmentedControl
          options={options as any}
          value={safeToSpendDays}
          onChange={val => setSafeToSpendDays(Number(val))}
          flex={true}
          size="sm"
        />
      </Box>
    </Stack>
  );
};
