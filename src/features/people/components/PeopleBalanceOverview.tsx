import { AppCard, AppIcon, AppText, Icon } from '@/src/components/core';
import { titleAmountFit } from '@/src/components/shared/FitText';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { peopleStrings } from '@/src/constants/copy/domains/peopleStrings';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Separator, Stack } from '@/src/design-system';
import { flowSignForAmount, signPrefix } from '@/src/domain/accounting/presentationPolicy';
import type { ReactNode } from 'react';

type Props = {
  currencyCode: string;
  owedToYou: number;
  youOwe: number;
  children?: ReactNode;
};

export function PeopleBalanceOverview({ currencyCode, owedToYou, youOwe, children }: Props) {
  const isPrivacyMode = useEffectivePrivacyMode();
  const net = owedToYou - youOwe;
  const total = owedToYou + youOwe;
  const directions = [
    { label: peopleStrings.owedToYou, amount: owedToYou, icon: Icon.ArrowDown, tone: 'income' },
    { label: peopleStrings.youOwe, amount: youOwe, icon: Icon.ArrowUp, tone: 'expense' },
  ] as const;

  return (
    <AppCard radius="xl" elevation="none" padding="xl" borderWidth={1} borderColor="border">
      <Stack gap="lg">
        <Stack gap="xs">
          <AppText variant="overline" color="secondary" accessibilityRole="header">
            {peopleStrings.netBalance(currencyCode)}
          </AppText>
          <MoneyText
            amount={Math.abs(net)}
            currencyCode={currencyCode}
            prefix={signPrefix(flowSignForAmount(net))}
            fit={titleAmountFit}
          />
        </Stack>

        {!isPrivacyMode && total > 0 ? (
          <Inline
            height={Spacing.xs}
            borderRadius="full"
            overflow="hidden"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {owedToYou > 0 ? (
              <Box width={`${(owedToYou / total) * 100}%`} background="income" />
            ) : null}
            {youOwe > 0 ? <Box flex={1} background="expense" /> : null}
          </Inline>
        ) : (
          <Separator background="divider" />
        )}

        <Inline gap="md" flexWrap="wrap">
          {directions.map(({ label, amount, icon, tone }) => (
            <Stack key={label} flexGrow={1} flexBasis="45%" gap="xs" minWidth={0}>
              <Inline gap="xs" alignItems="center">
                <AppIcon name={icon} size={Size.iconXs} color={tone} />
                <AppText variant="bodySmall" color="secondary" style={{ flexShrink: 1 }}>
                  {label}
                </AppText>
              </Inline>
              <MoneyText
                amount={amount}
                currencyCode={currencyCode}
                variant="body"
                color={amount > 0 ? tone : 'secondary'}
              />
            </Stack>
          ))}
        </Inline>
        {children ? (
          <Stack gap="sm">
            <Separator background="divider" />
            {children}
          </Stack>
        ) : null}
      </Stack>
    </AppCard>
  );
}
