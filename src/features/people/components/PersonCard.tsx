import {
  AppCard,
  AppIcon,
  AppText,
  Badge,
  PersonAvatar,
  PressScaleTouchable,
} from '@/src/components/core';
import { Opacity, Size, Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Inline, Stack } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon } from '@/src/types/domainIcons';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { StyleSheet } from 'react-native';
import type { PeopleListEntry } from '../hooks/usePeopleListViewModel';
import { PersonBalanceBadge } from './PersonBalanceBadge';

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
    <AppCard elevation="sm" padding="md" radius="xxl" background="surface" style={styles.card}>
      <PressScaleTouchable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}, open person details`}
        testID={`person-card-${person.id}`}
      >
        <Inline gap="md" alignItems="center">
          <PersonAvatar
            name={person.name}
            icon={person.icon}
            color={person.color}
            size={44}
            style={
              person.color
                ? undefined
                : {
                    borderWidth: 1,
                    borderColor: withOpacity(theme.primary, Opacity.medium),
                  }
            }
          />
          <Stack gap="xs" flex={1}>
            <Inline gap="sm" alignItems="center" flexWrap="wrap">
              <AppText variant="body" weight="semibold">
                {person.name}
              </AppText>
              {person.isPinned ? (
                <AppIcon name={Icon.Star} size={Size.iconXs} color="primary" />
              ) : null}
              {person.defaultCurrencyCode ? (
                <Badge size="sm">{person.defaultCurrencyCode}</Badge>
              ) : null}
              {person.archivedAt ? <Badge size="sm">Archived</Badge> : null}
              {hasNegativeUnassignedRemainder ? (
                <Badge size="sm" variant="warning">
                  Negative remainder
                </Badge>
              ) : null}
            </Inline>
            <PersonBalanceBadge
              summary={balanceSummary}
              personName={person.name}
              compact
              fallbackCurrencyCode={fallbackCurrencyCode}
              formatAmount={(amount, currencyCode) =>
                formatMoneyAmount(amount, currencyCode, isPrivacyMode)
              }
            />
          </Stack>
          <AppIcon name={Icon.ChevronRight} size={Size.iconSm} color="textSecondary" />
        </Inline>
      </PressScaleTouchable>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
  },
});
