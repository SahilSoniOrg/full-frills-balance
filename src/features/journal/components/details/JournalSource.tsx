import { useState } from 'react';
import { AppText, Icon, IconTile, ListRow, ListGroup } from '@/src/components/core';
import { ErrorStateView } from '@/src/components/shared/ErrorStateView';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import type { JournalSourceModel } from '../../journalDetailsPresentation';
import { JournalSmsSheet } from './JournalSmsSheet';

export function JournalSource({ source }: { source: JournalSourceModel }) {
  const [open, setOpen] = useState(false);
  const privateMode = useEffectivePrivacyMode();
  const strings = AppConfig.strings.journalDetails;
  if (source.error)
    return (
      <ListGroup header={strings.source} dividerInset="none">
        <ErrorStateView
          variant="inline"
          message={strings.sourceUnavailable}
          retryLabel={strings.retry}
          onRetry={source.onRetry}
          style={{ padding: Spacing.lg }}
        />
      </ListGroup>
    );
  const smsList = source.sms ?? [];
  const sms = smsList[0];
  const imported = source.import;
  if (!sms && !imported) return null;
  const senders = [
    ...new Set(smsList.map(item => item.sender).filter((sender): sender is string => !!sender)),
  ];
  const title = sms
    ? smsList.length > 1
      ? senders.length === 1
        ? strings.smsFromMany(privateMode ? AppConfig.privacyMask : senders[0], smsList.length)
        : strings.linkedSmsCount(smsList.length)
      : strings.smsFrom(privateMode ? AppConfig.privacyMask : (sms.sender ?? strings.unknownSender))
    : strings.importedFrom(imported!.name);
  const subtitle = sms
    ? [
        smsList.length > 1
          ? strings.linkedMessages(smsList.length)
          : sms.autoPosted
            ? strings.autoPosted
            : strings.imported,
        smsList.length === 1 && sms.referenceNumber
          ? strings.ref(privateMode ? AppConfig.privacyMask : sms.referenceNumber)
          : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
    : imported?.date;
  return (
    <>
      <ListGroup header={strings.source} testID="journal-source" dividerInset="none">
        <ListRow
          minHeight={Size.touchTargetLg}
          title={<AppText weight="semibold">{title}</AppText>}
          subtitle={subtitle}
          wrap
          leading={<IconTile icon={sms ? Icon.MessageSquare : Icon.Document} tint="asset" />}
          onPress={sms ? () => setOpen(true) : undefined}
          accessibilityLabel={title}
          testID="journal-source-row"
        />
      </ListGroup>
      {source.sms ? (
        <JournalSmsSheet
          visible={open}
          onClose={() => setOpen(false)}
          smsInfo={source.sms}
          onOpenSmsInbox={source.onOpenSmsInbox}
          onDetachSms={source.onDetachSms}
        />
      ) : null}
    </>
  );
}
