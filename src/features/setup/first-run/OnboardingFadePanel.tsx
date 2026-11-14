import { FadeIn } from '@/src/design-system';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

export function OnboardingFadePanel({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: ViewStyle;
}) {
  return (
    <FadeIn fromY={8} style={style}>
      {children}
    </FadeIn>
  );
}
