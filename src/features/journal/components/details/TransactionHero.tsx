import { AppIcon, AppText, Badge } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import React from 'react';

interface TransactionHeroProps {
  displayIcon: string;
  amountColor: string;
  amountText: string;
  descriptionText: string;
  statusLabel: string;
  statusVariant: any;
  displayTypeLabel?: string;
}

export const TransactionHero = React.memo(
  ({
    displayIcon,
    amountColor,
    amountText,
    descriptionText,
    statusLabel,
    statusVariant,
    displayTypeLabel,
  }: TransactionHeroProps) => {
    return (
      <Box alignItems="center" marginTop="md">
        <Box
          background={amountColor as any}
          backgroundOpacity="soft"
          width={Size.avatarLg}
          height={Size.avatarLg}
          borderRadius="full"
          alignItems="center"
          justifyContent="center"
          marginBottom="md"
        >
          <AppIcon name={displayIcon as any} size={Size.xxl} color={amountColor} />
        </Box>

        <AppText
          variant="title"
          color={amountColor as any}
          style={{ fontSize: 32, marginBottom: Spacing.xs, fontWeight: '700' }}
        >
          {amountText}
        </AppText>

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

TransactionHero.displayName = 'TransactionHero';
