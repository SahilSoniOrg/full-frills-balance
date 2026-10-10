import { AppText, ListRow, ListGroup } from '@/src/components/core';
import { DetailCaptionLink } from '@/src/components/shared/DetailCaptionLink';
import { DetailRow } from '@/src/components/shared/DetailRow';
import { AppConfig, Size, Spacing } from '@/src/constants';
import type { JournalScheduleModel } from '../../journalDetailsPresentation';

export function JournalSchedule({ schedule }: { schedule: JournalScheduleModel }) {
  const strings = AppConfig.strings.journalDetails;
  return (
    <ListGroup
      header={strings.schedule}
      testID="journal-schedule"
      dividerInset={Spacing.lg}
      headerAccessory={
        schedule.onRevert ? (
          <DetailCaptionLink label={strings.revertScheduled} onPress={schedule.onRevert} />
        ) : undefined
      }
    >
      <ListRow
        title={<AppText weight="semibold">{schedule.name}</AppText>}
        trailing={<ListRow.Value>{schedule.recurrence}</ListRow.Value>}
        chevron
        onPress={schedule.onPress}
        accessibilityLabel={schedule.name}
        minHeight={Size.touchTargetLg}
        trailingMaxWidth="60%"
      />
      <DetailRow label={strings.occurrence} value={schedule.since} />
      <DetailRow label={strings.afterThis} value={schedule.after} />
    </ListGroup>
  );
}
