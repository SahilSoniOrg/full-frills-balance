import { Section } from '@/src/components/common/Section';
import { AppButton, AppText, ListRow } from '@/src/components/core';
import { Box, Inset, Stack } from '@/src/design-system';
import React, { useMemo } from 'react';

export interface SmsInfo {
  sender?: string;
  smsDate?: string;
  amountText?: string;
  referenceNumber?: string;
  accountSource?: string;
  parseReason?: string;
  rawBody?: string;
}

interface TransactionSMSDetailsProps {
  smsInfo: SmsInfo;
  onOpenSmsInbox?: () => void;
}

interface SmsField {
  label: string;
  value: string;
}

export const TransactionSMSDetails = React.memo(
  ({ smsInfo, onOpenSmsInbox }: TransactionSMSDetailsProps) => {
    const fields = useMemo(() => {
      const list: SmsField[] = [];

      if (smsInfo.sender) list.push({ label: 'Sender', value: smsInfo.sender });
      if (smsInfo.smsDate) list.push({ label: 'SMS Date', value: smsInfo.smsDate });
      if (smsInfo.amountText) list.push({ label: 'Parsed Amount', value: smsInfo.amountText });
      if (smsInfo.referenceNumber)
        list.push({ label: 'Reference', value: smsInfo.referenceNumber });
      if (smsInfo.accountSource)
        list.push({ label: 'Account Source', value: smsInfo.accountSource });
      if (smsInfo.parseReason) list.push({ label: 'Parse Note', value: smsInfo.parseReason });

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
                <AppText variant="body" color="secondary">
                  {item.value}
                </AppText>
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

TransactionSMSDetails.displayName = 'TransactionSMSDetails';
