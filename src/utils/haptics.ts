import * as Haptics from 'expo-haptics';

export type HapticType =
  'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning';

export const triggerHaptic = async (type: HapticType) => {
  try {
    switch (type) {
      case 'selection':
        await Haptics.selectionAsync();
        break;
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
    }
  } catch {
    // Silently fail if haptics aren't available
  }
};

/** Success/error notification for a durable save outcome. */
export function triggerSaveOutcomeHaptic(success: boolean): void {
  void triggerHaptic(success ? 'success' : 'error');
}

/**
 * The one press-haptics map. Press controls opt in by intent via
 * `PressScaleTouchable haptic="..."`; plain taps (navigation rows, links,
 * closes) stay silent so subtle motion carries the feedback.
 *
 * - `none`        plain taps, navigation, dismiss (default)
 * - `selection`   toggles, chips, segments, tabs, picking one option from a list
 * - `primary`     the main action of a screen/sheet (FAB, primary button)
 * - `destructive` delete / reset style actions before confirmation
 *
 * Save outcomes are not press haptics: use `triggerSaveOutcomeHaptic`
 * (success / error) once the write resolves.
 */
export const PRESS_HAPTICS = {
  none: null,
  selection: 'selection',
  primary: 'medium',
  destructive: 'warning',
} as const satisfies Record<string, HapticType | null>;

export type PressHaptic = keyof typeof PRESS_HAPTICS;

/** Fire the haptic mapped to a press intent (no-op for `none`). */
export function triggerPressHaptic(intent: PressHaptic | undefined): void {
  const type = intent ? PRESS_HAPTICS[intent] : null;
  if (type) void triggerHaptic(type);
}
