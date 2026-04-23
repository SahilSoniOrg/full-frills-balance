import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import calendar from 'dayjs/plugin/calendar';

dayjs.extend(relativeTime);
dayjs.extend(calendar);

export function getSmartDateLabel(date: Date | string | number): string {
  const d = dayjs(date);
  const now = dayjs().startOf('day');
  const target = d.startOf('day');

  const diffDays = target.diff(now, 'day');

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `in ${diffDays} days`;
  if (diffDays < -1 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;

  return d.format('MMM D, YYYY');
}
