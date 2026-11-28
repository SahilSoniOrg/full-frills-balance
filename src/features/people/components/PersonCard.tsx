import { AppCard, AppText, Badge, ListRow, PersonAvatar } from '@/src/components/core';
import { Opacity } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Stack } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import type { PeopleListEntry } from '../hooks/usePeopleListViewModel';
import { PersonBalanceInline } from './PersonBalanceInline';
import { PersonMetaBadges } from './PersonMetaBadges';

type PersonCardProps = {
  row: PeopleListEntry;
  fallbackCurrencyCode: string;
  onPress: () => void;
};

export function PersonCard({ row, fallbackCurrencyCode, onPress }: PersonCardProps) {
  const { person, balanceSummary, hasNegativeUnassignedRemainder } = row;
  const isPrivacyMode = useEffectivePrivacyMode();
  const { theme } = useTheme();

  return (
    <AppCard elevation="sm" padding="none" radius="xxl" background="surface" marginBottom="md">
      <ListRow
        padding="md"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}, open person details`}
        testID={`person-card-${person.id}`}
        leading={
          <PersonAvatar
            name={person.name}
            icon={person.icon}
            color={person.color}
            style={
              person.color
                ? undefined
                : {
                    borderWidth: 1,
                    borderColor: withOpacity(theme.primary, Opacity.medium),
                  }
            }
          />
        }
        title={
          <Stack gap="xs">
            <PersonMetaBadges
              isPinned={person.isPinned}
              currency={person.defaultCurrencyCode}
              archived={Boolean(person.archivedAt)}
              pinnedPresentation="icon"
              leading={
                <AppText variant="body" weight="semibold">
                  {person.name}
                </AppText>
              }
              extras={
                hasNegativeUnassignedRemainder ? (
                  <Badge size="sm" variant="warning">
                    Negative remainder
                  </Badge>
                ) : null
              }
            />
            <PersonBalanceInline
              summary={balanceSummary}
              personName={person.name}
              fallbackCurrencyCode={fallbackCurrencyCode}
              formatAmount={(amount, currencyCode) =>
                formatMoneyAmount(amount, currencyCode, isPrivacyMode)
              }
            />
          </Stack>
        }
        chevron
      />
    </AppCard>
  );
}
