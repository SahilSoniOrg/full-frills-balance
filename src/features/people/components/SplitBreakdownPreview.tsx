import { AppText, Icon, IconTile, ListGroup, ListRow, PersonAvatar } from '@/src/components/core';
import { Stack } from '@/src/design-system';
import { View } from 'react-native';

type Props = {
  total: string;
  userShare: string;
  participants: { id: string; name: string; owedAmount: string }[];
};

export function SplitBreakdownPreview({ total, userShare, participants }: Props) {
  return (
    <View testID="split-breakdown-preview">
      <Stack gap="sm">
        <ListGroup
          header="SPLIT BREAKDOWN"
          headerAccessory={
            <AppText
              testID="split-total"
              variant="caption"
              weight="semibold"
              color="secondary"
              tabular
            >
              Total bill: {total}
            </AppText>
          }
          dividerInset="none"
        >
          <ListRow
            leading={<IconTile icon={Icon.Wallet} tint="primary" size="md" />}
            title="Your spending share"
            subtitle="Recorded against category"
            trailing={
              <AppText testID="split-user-share" variant="body" weight="semibold" tabular>
                {userShare}
              </AppText>
            }
          />
          {participants.map(person => (
            <ListRow
              key={person.id}
              leading={<PersonAvatar name={person.name} size={32} />}
              title={person.name}
              subtitle="Added to open receivable"
              trailing={
                <AppText
                  testID={`split-participant-${person.id}`}
                  variant="body"
                  weight="semibold"
                  color="income"
                  tabular
                >
                  {person.owedAmount}
                </AppText>
              }
            />
          ))}
        </ListGroup>
      </Stack>
    </View>
  );
}
