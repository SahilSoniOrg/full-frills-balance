import {
  readSystemUses24HourClock,
  resolveHourCycle,
  type HourCyclePreference,
  type ResolvedHourCycle,
} from '@/src/utils/hourCycle';
import { preferences } from '@/src/utils/preferences';
import { useCalendars } from 'expo-localization';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

export type HourCyclePrefsState = {
  hourCyclePreference: HourCyclePreference;
  resolvedHourCycle: ResolvedHourCycle;
  setHourCyclePreference: (value: HourCyclePreference) => void;
};

/**
 * Scoped hour-cycle prefs — expandable without growing UIContext or useTheme.
 */
export function useHourCyclePrefs(): HourCyclePrefsState {
  const calendars = useCalendars();
  const [osUses24HourClock, setOsUses24HourClock] = useState(readSystemUses24HourClock);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        setOsUses24HourClock(readSystemUses24HourClock());
      }
    });
    return () => subscription.remove();
  }, []);

  const hourCyclePreference = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.hourCycle.observePreference().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.hourCycle.preference,
    () => preferences.hourCycle.preference,
  );

  const uses24hourClock = useMemo((): boolean | null => {
    const fromHook = calendars[0]?.uses24hourClock;
    if (fromHook === true || fromHook === false) return fromHook;
    return osUses24HourClock;
  }, [calendars, osUses24HourClock]);

  const resolvedHourCycle = useMemo(
    () => resolveHourCycle(hourCyclePreference, uses24hourClock),
    [hourCyclePreference, uses24hourClock],
  );

  const setHourCyclePreference = useCallback((value: HourCyclePreference) => {
    preferences.hourCycle.setPreference(value);
  }, []);

  return {
    hourCyclePreference,
    resolvedHourCycle,
    setHourCyclePreference,
  };
}
