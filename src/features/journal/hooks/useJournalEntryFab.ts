import { Icon } from '@/src/components/core';
import type { ScreenFabChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { analytics } from '@/src/services/analytics';
import type { TabType } from '@/src/types/domainJournal';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';

export type JournalEntryFabScreen = 'dashboard' | 'activity';

/** Tab-root "New Entry" FAB that expands into expense / income / transfer choices. */
export function useJournalEntryFab(screen: JournalEntryFabScreen): ScreenFabChrome {
  return useMemo(() => {
    const strings = AppConfig.strings.journal;
    const openEntry = (type: TabType) => {
      analytics.logEntrypointSelected(screen, 'bottom_action', 'journal_entry');
      AppNavigation.toSimpleJournalEntry(type, { guidedAutopilot: true });
    };

    return {
      label: strings.newEntryFab.label,
      placement: 'end',
      accessibilityLabel: strings.newEntryFab.openOptions,
      closeAccessibilityLabel: strings.newEntryFab.closeOptions,
      onExpand: () => analytics.logEntrypointOpened(screen, 'bottom_action'),
      actions: [
        {
          id: 'expense',
          label: strings.expense,
          icon: Icon.ArrowDown,
          testID: 'journal-entry-fab-expense',
          onPress: () => openEntry('expense'),
        },
        {
          id: 'income',
          label: strings.income,
          icon: Icon.ArrowUp,
          testID: 'journal-entry-fab-income',
          onPress: () => openEntry('income'),
        },
        {
          id: 'transfer',
          label: strings.transfer,
          icon: Icon.SwapHorizontal,
          testID: 'journal-entry-fab-transfer',
          onPress: () => openEntry('transfer'),
        },
      ],
    };
  }, [screen]);
}
