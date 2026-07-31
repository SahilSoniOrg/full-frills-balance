import { ReconciledMarker } from '@/src/features/accounts/components/ReconciledMarker';
import { JournalDayHeader } from '@/src/features/journal/components/JournalDayHeader';

/** @deprecated Use JournalDayHeader or ReconciledMarker directly. */
interface DaySeparatorProps {
  date: number;
  isCollapsed?: boolean;
  onToggle?: () => void;
  count?: number;
  netAmount?: number;
  currencyCode?: string;
  isReconciledMarker?: boolean;
  reconciledAt?: number | null;
  isPrivacyMode?: boolean;
}

/** @deprecated Use JournalDayHeader or ReconciledMarker directly. */
export function DaySeparator({
  date,
  isCollapsed,
  onToggle,
  count,
  netAmount,
  currencyCode,
  isReconciledMarker,
  reconciledAt,
  isPrivacyMode,
}: DaySeparatorProps) {
  if (isReconciledMarker) {
    return <ReconciledMarker date={date} />;
  }

  return (
    <JournalDayHeader
      date={date}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
      count={count}
      netAmount={netAmount}
      currencyCode={currencyCode}
      reconciledAt={reconciledAt}
      isPrivacyMode={isPrivacyMode}
    />
  );
}
