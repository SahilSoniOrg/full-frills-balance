import { AppText } from '@/src/components/core';
import { ActionButtonPair } from '@/src/components/shared/ActionButtonPair';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppConfig, Opacity } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { blendColors } from '@/src/utils/color-math';
import type { JournalPlannedModel } from '../../journalDetailsPresentation';

export function JournalPlannedActions({ planned }: { planned: JournalPlannedModel }) {
  const formatMoney = useMoneyFormat();
  const { theme } = useTheme();
  const strings = AppConfig.strings.journalDetails;
  const { notice, move, pending } = planned;
  const tint = notice ? 'warning' : 'asset';
  const message = !move
    ? strings.plannedSplit
    : (move.direction === 'in' ? strings.plannedIn : strings.plannedOut)(
        formatMoney(move.amount, move.currencyCode),
        move.accountName,
      );
  return (
    <Stack space="md" padding="md" borderRadius="lg" background={tint} backgroundOpacity="soft">
      <AppText
        variant="body"
        color={tint}
        contrastOn={blendColors(theme[tint], theme.background, Opacity.soft)}
      >
        {notice ?? message}
      </AppText>
      <ActionButtonPair
        disabled={!!pending}
        primary={{
          label: strings.post,
          onPress: planned.onPost,
          loading: pending === 'post',
          testID: 'journal-post',
        }}
        secondary={
          planned.onSkip
            ? {
                label: strings.skip,
                onPress: planned.onSkip,
                loading: pending === 'skip',
                testID: 'journal-skip',
              }
            : undefined
        }
      />
    </Stack>
  );
}
