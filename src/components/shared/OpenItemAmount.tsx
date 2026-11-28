import { AppText, Badge } from '@/src/components/core';
import { Inline, Stack } from '@/src/design-system';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';

/** Shared remainder and original amount presentation for an open item. */
export function OpenItemAmount({
  remainder,
  originalAmount,
  currencyCode,
  isPrivacyMode,
}: {
  remainder: number;
  originalAmount: number;
  currencyCode: string;
  isPrivacyMode: boolean;
}) {
  const partial = remainder < originalAmount;
  return (
    <Stack gap="xs">
      <Inline gap="sm" alignItems="center" flexWrap="wrap">
        <AppText variant="body" weight="semibold" tabular>
          {formatMoneyAmount(remainder, currencyCode, isPrivacyMode)} remaining
        </AppText>
        {partial ? (
          <Badge size="sm" variant="warning">
            Partial
          </Badge>
        ) : null}
      </Inline>
      <AppText variant="caption" color="secondary" tabular>
        of {formatMoneyAmount(originalAmount, currencyCode, isPrivacyMode)} total
      </AppText>
    </Stack>
  );
}
