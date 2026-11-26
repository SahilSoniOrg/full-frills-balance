import type { ViewProps } from 'react-native';

export type CoveredInteractionProps = Pick<
  ViewProps,
  'pointerEvents' | 'accessibilityElementsHidden' | 'importantForAccessibility'
>;

/** Interaction and accessibility props for chrome covered by an active overlay. */
export function coveredInteractionProps(covered: boolean): CoveredInteractionProps {
  return {
    pointerEvents: covered ? 'none' : 'auto',
    accessibilityElementsHidden: covered,
    importantForAccessibility: covered ? 'no-hide-descendants' : 'auto',
  };
}
