import type { IconName } from '@/src/components/core';
import type { DetailMenuAction } from '@/src/components/shared/DetailHeaderMenuActions';
import type { ScreenHeaderActionItem } from '@/src/components/shared/ScreenHeaderActions';
import type { Theme } from '@/src/constants/design-tokens';

/** Archive, delete, disband or merge, before a screen decides to show it as a button or a menu row. */
export interface AccountManagementAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** `active` marks a toggle that is currently on, such as archive on an archived account. */
  tone: 'destructive' | 'active' | 'neutral';
  disabled?: boolean;
  testID: string;
}

export function toHeaderIconButtons(
  actions: readonly AccountManagementAction[],
  theme: Theme,
): ScreenHeaderActionItem[] {
  const toneColor = {
    destructive: theme.error,
    active: theme.primary,
    neutral: theme.textSecondary,
  };
  return actions.map(action => ({
    name: action.icon,
    onPress: action.onPress,
    variant: 'surface',
    iconColor: toneColor[action.tone],
    disabled: action.disabled,
    testID: action.testID,
    accessibilityLabel: action.label,
  }));
}

export function toMenuActions(actions: readonly AccountManagementAction[]): DetailMenuAction[] {
  return actions.map(({ label, icon, onPress, disabled, testID, tone }) => ({
    label,
    icon,
    onPress,
    disabled,
    testID,
    destructive: tone === 'destructive',
  }));
}
