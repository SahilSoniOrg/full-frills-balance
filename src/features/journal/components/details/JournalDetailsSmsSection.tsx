import { MoneyText } from '@/src/components/common/MoneyText';
import { Section } from '@/src/components/common/Section';
import { AppButton, AppText, ListRow } from '@/src/components/core';
import { Box, Inset, Stack } from '@/src/design-system';
import React, { useMemo } from 'react';

export interface SmsInfo {
  sender?: string;
  smsDate?: string;
  amount?: number;
  currencyCode?: string;
  referenceNumber?: string;
  accountSource?: string;
  parseReason?: string;
  rawBody?: string;
}

interface JournalDetailsSmsSectionProps {
  smsInfo: SmsInfo;
  onOpenSmsInbox?: () => void;
}

type SmsField =
  | { kind: 'text'; label: string; value: string }
  | { kind: 'money'; label: string; amount: number; currencyCode: string };

export const JournalDetailsSmsSection = React.memo(
  ({ smsInfo, onOpenSmsInbox }: JournalDetailsSmsSectionProps) => {
    const fields = useMemo(() => {
      const list: SmsField[] = [];

      if (smsInfo.sender) list.push({ kind: 'text', label: 'Sender', value: smsInfo.sender });
      if (smsInfo.smsDate) list.push({ kind: 'text', label: 'SMS Date', value: smsInfo.smsDate });
      if (typeof smsInfo.amount === 'number') {
        list.push({
          kind: 'money',
          label: 'Parsed Amount',
          amount: smsInfo.amount,
          currencyCode: smsInfo.currencyCode ?? '',
        });
      }
      if (smsInfo.referenceNumber)
        list.push({ kind: 'text', label: 'Reference', value: smsInfo.referenceNumber });
      if (smsInfo.accountSource)
        list.push({ kind: 'text', label: 'Account Source', value: smsInfo.accountSource });
      if (smsInfo.parseReason)
        list.push({ kind: 'text', label: 'Parse Note', value: smsInfo.parseReason });

      return list;
    }, [smsInfo]);

    return (
      <Stack space="md">
        <Section<SmsField>
          title="Imported From SMS"
          items={fields}
          emptyText="No SMS fields parsed."
          keyExtractor={item => item.label}
          renderItem={item => (
            <ListRow
              title={item.label}
              trailing={
                item.kind === 'money' ? (
                  <MoneyText
                    amount={item.amount}
                    currencyCode={item.currencyCode}
                    variant="body"
                    color="secondary"
                  />
                ) : (
                  <AppText variant="body" color="secondary">
                    {item.value}
                  </AppText>
                )
              }
              padding="md"
            />
          )}
        />

        {smsInfo.rawBody && (
          <Section title="SMS Raw Body">
            <Inset horizontal="md" vertical="md">
              <AppText variant="caption" color="secondary">
                RAW SMS
              </AppText>
              <Box marginTop="xs">
                <AppText variant="body" color="secondary">
                  {smsInfo.rawBody}
                </AppText>
              </Box>
            </Inset>
          </Section>
        )}

        {onOpenSmsInbox && (
          <Inset horizontal="md" vertical="md">
            <AppButton variant="ghost" onPress={onOpenSmsInbox} style={{ width: '100%' }}>
              Open SMS Inbox
            </AppButton>
          </Inset>
        )}
      </Stack>
    );
  },
);

JournalDetailsSmsSection.displayName = 'JournalDetailsSmsSection';
