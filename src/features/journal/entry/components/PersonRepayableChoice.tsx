import { AppCard, AppSegmentedControl, AppText, Icon, IconTile } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { Inline, Stack } from '@/src/design-system';
import { StyleSheet } from 'react-native';
import { getPersonRepayablePrompt } from '../personRepayablePolicy';

type Props = {
  flow: 'outflow' | 'inflow';
  personName: string;
  repayable: boolean;
  onChange: (repayable: boolean) => void;
};

export function PersonRepayableChoice({ flow, personName, repayable, onChange }: Props) {
  const prompt = getPersonRepayablePrompt({ flow, personName, repayable });
  return (
    <AppCard
      variant="outline"
      padding="md"
      radius="xl"
      style={styles.card}
      accessibilityLabel="Repayment choice"
      testID="person-repayable-choice"
    >
      <Stack gap="sm">
        <Inline gap="sm" alignItems="center">
          <IconTile
            icon={repayable ? Icon.SwapHorizontal : Icon.Heart}
            tint={repayable ? 'primary' : 'income'}
            size="sm"
          />
          <AppText variant="body" weight="semibold" style={{ flex: 1 }}>
            {prompt.question}
          </AppText>
        </Inline>
        <AppSegmentedControl
          options={[
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ]}
          value={repayable ? 'yes' : 'no'}
          onChange={value => onChange(value === 'yes')}
        />
        <AppText color="secondary" variant="caption">
          {prompt.hint}
        </AppText>
      </Stack>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
});
