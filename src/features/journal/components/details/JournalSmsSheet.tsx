import { AppText } from '@/src/components/core';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { DetailRow } from '@/src/components/shared/DetailRow';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { AppConfig, Opacity } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import {
  findSmsHighlightRanges,
  splitSmsByHighlights,
  type SmsHighlightKind,
} from '@/src/services/journal/smsHighlightRanges';
import type { SmsJournalInfoDisplay } from '@/src/services/journal/journalDetailsHelpers';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { formatDate } from '@/src/utils/dateUtils';
import { useTheme } from '@/src/hooks/use-theme';
import { blendColors } from '@/src/utils/color-math';

const colors = {
  amount: 'expense',
  account: 'asset',
  merchant: 'liability',
  reference: 'primary',
} as const;

function SmsMessage({ sms }: { sms: SmsJournalInfoDisplay }) {
  const { theme, getVariantColors } = useTheme();
  const privateMode = useEffectivePrivacyMode();
  const strings = AppConfig.strings.journalDetails;
  const { resolvedHourCycle } = useHourCyclePrefs();
  const body = sms.rawBody ?? '';
  const tintOf = (kind: SmsHighlightKind) =>
    kind === 'amount' ? (sms.amountColor ?? colors.amount) : colors[kind];
  const highlightBackground = (kind: SmsHighlightKind) =>
    blendColors(getVariantColors(tintOf(kind)).main, theme.surfaceSecondary, Opacity.soft);
  const ranges = findSmsHighlightRanges(body, {
    amount: sms.amount,
    accountHint: sms.accountSource,
    merchant: sms.merchant,
    reference: sms.referenceNumber,
  });
  const chunks = splitSmsByHighlights(body, ranges);
  const legendLabels: Record<SmsHighlightKind, string> = {
    amount: strings.amountRead,
    account: strings.accountHint,
    merchant: strings.merchant,
    reference: strings.reference,
  };
  return (
    <Stack space="md">
      {sms.receivedAt !== undefined ? (
        <AppText variant="caption" color="secondary">
          {strings.received(
            formatDate(sms.receivedAt, { includeTime: true, hourCycle: resolvedHourCycle }),
            sms.autoPosted ? strings.autoPost : strings.linkedManually,
          )}
        </AppText>
      ) : null}
      {body ? (
        <Box padding="md" background="surfaceSecondary" borderRadius="lg">
          <AppText>
            {privateMode
              ? strings.hiddenSms
              : chunks.map(({ text, kind }, index) =>
                  kind ? (
                    <AppText
                      key={index}
                      color={tintOf(kind)}
                      contrastOn={highlightBackground(kind)}
                      weight="semibold"
                      style={{ backgroundColor: highlightBackground(kind) }}
                    >
                      {text}
                    </AppText>
                  ) : (
                    <AppText key={index}>{text}</AppText>
                  ),
                )}
          </AppText>
        </Box>
      ) : null}
      {!privateMode && ranges.length > 0 ? (
        <Inline space="sm" flexWrap="wrap">
          {[...new Set(ranges.map(range => range.kind))].map(kind => (
            <AppText key={kind} variant="caption" color={tintOf(kind)} contrastOn={theme.surface}>
              {strings.legendMark(legendLabels[kind])}
            </AppText>
          ))}
        </Inline>
      ) : null}
      {sms.amount !== undefined ? (
        <DetailRow
          label={strings.amountRead}
          value={
            sms.currencyCode ? (
              <MoneyText amount={sms.amount} currencyCode={sms.currencyCode} variant="body" />
            ) : privateMode ? (
              AppConfig.privacyMask
            ) : (
              String(sms.amount)
            )
          }
          showSeparator
        />
      ) : null}
      {[
        { label: strings.accountHint, value: sms.accountSource },
        { label: strings.merchant, value: sms.merchant },
        { label: strings.reference, value: sms.referenceNumber },
      ]
        .filter(field => field.value)
        .map(field => (
          <DetailRow
            key={field.label}
            label={field.label}
            value={field.value}
            selectable
            showSeparator
          />
        ))}
    </Stack>
  );
}

export function JournalSmsSheet({
  visible,
  onClose,
  smsInfo,
  onOpenSmsInbox,
}: {
  visible: boolean;
  onClose: () => void;
  smsInfo: SmsJournalInfoDisplay[];
  onOpenSmsInbox?: () => void;
}) {
  const afterDismiss = useAfterDismiss();
  const strings = AppConfig.strings.journalDetails;
  return (
    <InfoSheet
      visible={visible}
      title={strings.smsFrom(smsInfo[0]?.sender ?? strings.unknownSender)}
      position="bottomSheet"
      accessibilityCloseLabel={strings.closeSms}
      fixedHeight={false}
      onClose={() => {
        afterDismiss.cancel();
        onClose();
      }}
      onDismiss={afterDismiss.onDismiss}
      primaryAction={
        onOpenSmsInbox
          ? {
              label: strings.inbox,
              variant: 'outline',
              onPress: () => {
                onClose();
                afterDismiss.run(onOpenSmsInbox);
              },
            }
          : undefined
      }
    >
      <Stack space="xl">
        {smsInfo.map((sms, index) => (
          <SmsMessage key={sms.inboxRecordId ?? index} sms={sms} />
        ))}
      </Stack>
    </InfoSheet>
  );
}
