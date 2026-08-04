import { MoneyText } from '@/src/components/common/MoneyText';
import { AppIcon, AppText, Badge } from '@/src/components/core';
import { ColorKey, Size, Spacing } from '@/src/constants';
import { Box, Inline, Row } from '@/src/design-system';
import { JournalStatusChipVariant } from '@/src/services/journal/transactionDetailsHelpers';
import React from 'react';

interface TransactionHeroProps {
  displayIcon: string;
  amountColor: ColorKey | string;
  amount: number;
  currencyCode: string;
  amountPrefix: '+' | '-' | '';
  descriptionText: string;
  statusLabel: string;
  statusVariant: JournalStatusChipVariant;
  displayTypeLabel?: string;
}

export const TransactionHero = React.memo(
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

        <Row alignItems="center" style={{ marginBottom: Spacing.xs }}>
          {amountPrefix ? (
            <AppText
              variant="title"
              color={amountColor as any}
              style={{ fontSize: 32, fontWeight: '700' }}
            >
              {amountPrefix}
            </AppText>
          ) : null}
          <MoneyText
            amount={amount}
            currencyCode={currencyCode}
            variant="title"
            color={amountColor as any}
            style={{ fontSize: 32, fontWeight: '700' }}
          />
        </Row>

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
