import type { JournalEntryScreenMode } from './journalEntryPresentation';
import { Icon, type IconName } from '@/src/types/domainIcons';

export const JOURNAL_ENTRY_MODE_OPTIONS: readonly {
  id: JournalEntryScreenMode;
  label: string;
  subtitle: string;
  bestFor: string;
  recommended?: boolean;
  icon: IconName;
}[] = [
  {
    id: 'basic',
    label: 'Simple',
    subtitle: 'One transaction with one account on each side',
    bestFor: 'Best for most expenses, income, and transfers',
    recommended: true,
    icon: Icon.Zap,
  },
  {
    id: 'allocation',
    label: 'Split',
    subtitle: 'One transaction divided between several categories',
    bestFor: 'Best for a receipt or deposit that covers several things',
    icon: Icon.PieChart,
  },
  {
    id: 'expert',
    label: 'Advanced',
    subtitle: 'One custom entry with several debit and credit lines',
    bestFor: 'Best for fees, payroll, adjustments, or split funding',
    icon: Icon.Scale,
  },
  {
    id: 'batch',
    label: 'Batch',
    subtitle: 'Several separate transactions entered together',
    bestFor: 'Best for catching up from a statement or a list of receipts',
    icon: Icon.Hierarchy,
  },
];
