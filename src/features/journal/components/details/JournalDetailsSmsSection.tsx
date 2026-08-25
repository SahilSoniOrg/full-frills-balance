import { MoneyText } from '@/src/components/common/MoneyText';
import { Section } from '@/src/components/common/Section';
import { AppButton, AppIcon, AppText, ListRow } from '@/src/components/core';
import { Box, Inset, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo, useState } from 'react';
import { Pressable } from 'react-native';

export interface SmsInfo {
  sender?: string;
  smsDate?: string;
  amount?: number;
  currencyCode?: string;
  referenceNumber?: string;
  accountSource?: string;
  parseReason?: string;
  rawBody?: string;
  inboxRecordId?: string;
}

interface JournalDetailsSmsSectionProps {
  smsInfo: SmsInfo[];
  onOpenSmsInbox?: () => void;
}

type SmsField =
  | { kind: 'text'; label: string; value: string }
  | { kind: 'money'; label: string; amount: number; currencyCode: string };

export const JournalDetailsSmsSection = React.memo(
  ({ smsInfo, onOpenSmsInbox }: JournalDetailsSmsSectionProps) => {
    const { theme } = useTheme();
    const [isExpanded, setIsExpanded] = useState(false);
    const smsSections = useMemo(() => {
      return smsInfo.map(sms => {
        const fields: SmsField[] = [];
        if (sms.sender) fields.push({ kind: 'text', label: 'Sender', value: sms.sender });
        if (sms.smsDate) fields.push({ kind: 'text', label: 'SMS Date', value: sms.smsDate });
        if (typeof sms.amount === 'number') {
          fields.push({
            kind: 'money',
            label: 'Parsed Amount',
            amount: sms.amount,
            currencyCode: sms.currencyCode ?? '',
          });
        }
        if (sms.referenceNumber)
          fields.push({ kind: 'text', label: 'Reference', value: sms.referenceNumber });
        if (sms.accountSource)
          fields.push({ kind: 'text', label: 'Account Source', value: sms.accountSource });
        if (sms.parseReason)
          fields.push({ kind: 'text', label: 'Parse Note', value: sms.parseReason });
        return { sms, fields };
      });
    }, [smsInfo]);

    return (
      <Stack space="md">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} imported SMS section`}
          onPress={() => setIsExpanded(value => !value)}
        >
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <AppText variant="subheading" weight="bold">
              Imported From SMS{smsInfo.length > 1 ? ` (${smsInfo.length})` : ''}
            </AppText>
            <AppIcon
              name={isExpanded ? 'chevronDown' : 'chevronRight'}
              size={18}
              color={theme.textSecondary}
            />
          </Box>
        </Pressable>

        {isExpanded && (
          <Stack space="md">
            {smsSections.map(({ sms, fields }, index) => (
              <Stack key={sms.inboxRecordId || `sms-${index}`} space="md">
                <Section<SmsField>
                  title={`SMS${smsInfo.length > 1 ? ` ${index + 1}` : ''}`}
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

                {sms.rawBody && (
                  <Section title="SMS Raw Body">
                    <Inset horizontal="md" vertical="md">
                      <AppText variant="caption" color="secondary">
                        RAW SMS
                      </AppText>
                      <Box marginTop="xs">
                        <AppText variant="body" color="secondary">
                          {sms.rawBody}
                        </AppText>
                      </Box>
                    </Inset>
                  </Section>
                )}
              </Stack>
            ))}

            {onOpenSmsInbox && (
              <Inset horizontal="md" vertical="md">
                <AppButton variant="ghost" onPress={onOpenSmsInbox} style={{ width: '100%' }}>
                  Open SMS Inbox
                </AppButton>
              </Inset>
            )}
          </Stack>
        )}
      </Stack>
    );
  },
);

JournalDetailsSmsSection.displayName = 'JournalDetailsSmsSection';
