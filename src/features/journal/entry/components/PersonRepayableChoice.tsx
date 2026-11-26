import { AppCard, AppSegmentedControl, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { getPersonRepayablePrompt } from '../personRepayablePolicy';
import { View } from 'react-native';

type Props = {
  flow: 'outflow' | 'inflow';
  personName: string;
  repayable: boolean;
  onChange: (repayable: boolean) => void;
};
export function PersonRepayableChoice({ flow, personName, repayable, onChange }: Props) {
  const prompt = getPersonRepayablePrompt({ flow, personName, repayable });
  return (
    <AppCard accessibilityLabel="Repayment choice" testID="person-repayable-choice">
      <View style={{ gap: Spacing.sm }}>
        <AppText variant="body" weight="semibold">
          {prompt.question}
        </AppText>
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
      </View>
    </AppCard>
  );
}
