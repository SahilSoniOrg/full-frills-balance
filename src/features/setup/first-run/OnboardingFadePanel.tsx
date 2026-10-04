import { FadeIn } from '@/src/design-system';
import type { ReactNode } from 'react';

export function OnboardingFadePanel({ children }: { readonly children: ReactNode }) {
  return <FadeIn fromY={8}>{children}</FadeIn>;
}
