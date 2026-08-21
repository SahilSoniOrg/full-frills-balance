import { MoneyText } from '@/src/components/common/MoneyText';
import { AppIcon, AppText, Badge, type IconName } from '@/src/components/core';
import { ColorKey, Size, Spacing } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { JournalStatusChipVariant } from '@/src/services/journal/journalDetailsHelpers';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import React from 'react';

interface JournalDetailsHeroProps {
  displayIcon: IconName;
  amountColor: ColorKey;
  amount: number;
  currencyCode: string;
  amountPrefix: '+' | '-' | '';
  descriptionText: string;
  statusLabel: string;
  statusVariant: JournalStatusChipVariant;
  displayTypeLabel?: string;
}

export const JournalDetailsHero = React.memo(
  ({
    displayIcon,
    amountColor,
    amount,
    currencyCode,
    amountPrefix,
    descriptionText,
    statusLabel,
    statusVariant,
    displayTypeLabel,
  }: JournalDetailsHeroProps) => {
    return (
      <Box alignItems="center" marginTop="md">
        <Box
          background={amountColor}
          backgroundOpacity="soft"
          width={Size.avatarLg}
          height={Size.avatarLg}
          borderRadius="full"
          alignItems="center"
          justifyContent="center"
          marginBottom="md"
        >
          <AppIcon name={displayIcon} size={Size.xxl} color={amountColor} />
        </Box>

        <MoneyText
          amount={amount}
          currencyCode={currencyCode}
          prefix={amountPrefix || undefined}
          variant="title"
          color={amountColor as ComponentVariant}
          style={{ fontSize: 32, fontWeight: '700', marginBottom: Spacing.xs }}
        />

        <AppText
          variant="body"
          color="secondary"
          style={{ textAlign: 'center', marginBottom: Spacing.md }}
        >
          {descriptionText}
        </AppText>

        <Inline space="sm">
          <Badge variant={statusVariant} size="sm">
            {statusLabel}
          </Badge>
          {displayTypeLabel && (
            <Badge variant="default" size="sm">
              {displayTypeLabel}
            </Badge>
          )}
        </Inline>
      </Box>
    );
  },
);

JournalDetailsHero.displayName = 'JournalDetailsHero';
