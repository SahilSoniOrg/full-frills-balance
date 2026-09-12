import type { IconName } from '@/src/types/domainIcons';

export type FilterChromeItemKind = 'date' | 'account' | 'search' | 'custom';

export interface FilterChromeItem {
  id: string;
  kind: FilterChromeItemKind;
  label: string;
  value: string;
  icon?: IconName;
  active?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export interface FilterChromeModel {
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  items: readonly FilterChromeItem[];
}
