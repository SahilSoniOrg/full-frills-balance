import { AppSegmentedControl, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';

interface SafeToSpendPreferenceViewProps {
  days: number;
  onChange: (days: number) => void;
  workplaceName?: string;
}

export const SafeToSpendPreferenceView = ({
  days,
  onChange,
  workplaceName,
}: SafeToSpendPreferenceViewProps) => {
  const strings = AppConfig.strings.settings.personalization;

  const options = [
    { id: 30, label: '30 Days' },
    { id: 60, label: '60 Days' },
    { id: 90, label: '90 Days' },
  ];

  return (
    <Stack space="md" paddingHorizontal="md" paddingVertical="md">
      <Stack space="xs">
        <AppText variant="body" weight="medium">
          {strings.forecastTitle}
        </AppText>
        <AppText variant="caption" color="secondary">
          {strings.forecastDesc}
        </AppText>
        {workplaceName ? (
          <AppText variant="caption" color="secondary">
            Saved for {workplaceName} only.
          </AppText>
        ) : null}
      </Stack>

      <Box>
        <AppSegmentedControl
          testID="safe-to-spend-horizon"
          options={options}
          value={days}
          onChange={val => onChange(Number(val))}
          flex={true}
          size="sm"
        />
      </Box>
    </Stack>
  );
};
