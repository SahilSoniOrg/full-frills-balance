import { AppCard, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { View } from 'react-native';

type Props = {
  total: string;
  userShare: string;
  participants: { id: string; name: string; owedAmount: string }[];
};
export function SplitBreakdownPreview({ total, userShare, participants }: Props) {
  return (
    <AppCard testID="split-breakdown-preview">
      <View style={{ gap: Spacing.sm }}>
        <AppText testID="split-total">Total bill: {total}</AppText>
        <AppText testID="split-user-share">Your spending share: {userShare}</AppText>
        {participants.map(person => (
          <AppText key={person.id} testID={`split-participant-${person.id}`}>
            {person.name}: {person.owedAmount}
          </AppText>
        ))}
      </View>
    </AppCard>
  );
}
