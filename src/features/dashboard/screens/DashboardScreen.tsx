import { DashboardScreenView } from '@/src/features/dashboard/components/DashboardScreenView';
import { useDashboardViewModel } from '@/src/features/dashboard/hooks/useDashboardViewModel';
import { analytics } from '@/src/services/analytics-service';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useScrollToTop } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef } from 'react';

export default function DashboardScreen() {
  const vm = useDashboardViewModel();
  const listRef = useRef(null);

  // Track Mount
  useEffect(() => {
    logger.info('[Dashboard] Screen Mounted');
  }, []);

  // Track "First Paint" - Only fires once upon initial landing on Dashboard
  useEffect(() => {
    interface GlobalBootState {
      __BOOT_START_TIME__?: number;
      __HAS_MOUNTED_BEFORE__?: boolean;
    }
    const globalState = globalThis as unknown as GlobalBootState;
    const startTime = globalState.__BOOT_START_TIME__;
    if (startTime) {
      const duration = performance.now() - startTime;

      // TIGHTENED: Use real state flag instead of timing guess for higher fidelity
      const isColdBoot = !globalState.__HAS_MOUNTED_BEFORE__;
      globalState.__HAS_MOUNTED_BEFORE__ = true;

      // Record both a telemetry event and a metric for different analysis paths
      analytics.track('first_paint', {
        duration_ms: Math.round(duration),
        is_cold_boot: isColdBoot,
      });
      logger.info(`[Performance] First Paint: ${Math.round(duration)}ms (Cold: ${isColdBoot})`);

      // Clear to prevent double tracking on subsequent HMR or re-mounts
      globalState.__BOOT_START_TIME__ = undefined;
    }
  }, []);

  useScrollToTop(listRef);

  const handleNewEntryPress = useCallback(() => {
    analytics.logEntrypointOpened('dashboard', 'bottom_action');
    analytics.logEntrypointSelected('dashboard', 'bottom_action', 'journal_entry');
    AppNavigation.toJournalEntry();
  }, []);

  return (
    <DashboardScreenView
      {...vm}
      listRef={listRef}
      fab={{
        onPress: handleNewEntryPress,
        label: 'New Entry',
        placement: 'end',
        accessibilityLabel: 'Open new entry options',
      }}
    />
  );
}
