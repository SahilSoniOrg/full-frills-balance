import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import dayjs from 'dayjs';
import { getNow } from '@/src/utils/dateUtils';

/** Refresh calendar projections at midnight and after the app returns from the background. */
export function useCalendarDay(): number {
  const [day, setDay] = useState(() => dayjs(getNow()).startOf('day').valueOf());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = getNow();
      setDay(dayjs(now).startOf('day').valueOf());
      timer = setTimeout(refresh, dayjs(now).add(1, 'day').startOf('day').valueOf() - now);
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);
  return day;
}
