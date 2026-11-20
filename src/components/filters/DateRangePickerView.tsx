import { AppText } from '@/src/components/core';
import { ModalActions } from '@/src/components/overlays/ModalActions';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { AppConfig } from '@/src/constants';
import { PeriodFilter } from '@/src/domain/calendar/dateRanges';
import type { Dayjs } from 'dayjs';
import { StyleSheet } from 'react-native';
import { DateRangeCalendarStep } from './DateRangeCalendarStep';
import { DateRangeMenuContent } from './DateRangeMenuContent';

export type PickerView = 'MENU' | 'START_DATE' | 'END_DATE';

export interface DateRangePickerViewProps {
  visible: boolean;
  onClose: () => void;
  view: PickerView;
  setView: (view: PickerView) => void;
  draftFilter: PeriodFilter;
  customRange: { startDate: Dayjs | null; endDate: Dayjs | null };
  lastNValue: string;
  lastNUnit: 'days' | 'weeks' | 'months';
  monthList: { month: number; year: number; label: string }[];
  handleSelectMonth: (month: number, year: number) => void;
  handleSelectCustom: () => void;
  handleSelectAllTime: () => void;
  updateLastN: (value: string, unit: 'days' | 'weeks' | 'months') => void;
  handleDateSelect: (date: Dayjs) => void;
  handleApply: () => void;
}

const TITLE_BY_VIEW: Record<PickerView, string> = {
  MENU: 'Choose Range',
  START_DATE: 'Start Date',
  END_DATE: 'End Date',
};

export function DateRangePickerView({
  visible,
  onClose,
  view,
  setView,
  draftFilter,
  customRange,
  lastNValue,
  lastNUnit,
  monthList,
  handleSelectMonth,
  handleSelectCustom,
  handleSelectAllTime,
  updateLastN,
  handleDateSelect,
  handleApply,
}: DateRangePickerViewProps) {
  return (
    <ModalSurface
      visible={visible}
      title={TITLE_BY_VIEW[view]}
      onClose={onClose}
      onRequestClose={view === 'MENU' ? onClose : () => setView('MENU')}
      position="bottomSheet"
      scrollable={false}
      contentStyle={styles.body}
      accessibilityCloseLabel={AppConfig.strings.common.close}
      footer={
        view === 'MENU' ? (
          <ModalActions actions={[{ label: 'Apply Range', onPress: handleApply }]} />
        ) : undefined
      }
    >
      {view === 'MENU' ? (
        <AppText variant="caption" color="secondary">
          Pick a month, custom dates, or a rolling window.
        </AppText>
      ) : null}
      {view === 'MENU' ? (
        <DateRangeMenuContent
          draftFilter={draftFilter}
          customRange={customRange}
          lastNValue={lastNValue}
          lastNUnit={lastNUnit}
          monthList={monthList}
          onSelectMonth={handleSelectMonth}
          onSelectCustom={handleSelectCustom}
          onSelectAllTime={handleSelectAllTime}
          onShowStartDate={() => setView('START_DATE')}
          onShowEndDate={() => setView('END_DATE')}
          onUpdateLastN={updateLastN}
        />
      ) : (
        <DateRangeCalendarStep
          mode={view}
          date={view === 'START_DATE' ? customRange.startDate : customRange.endDate}
          onBack={() => setView('MENU')}
          onSelect={handleDateSelect}
        />
      )}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
  },
});
