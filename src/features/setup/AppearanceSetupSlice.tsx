import { FontIds, ThemeIds } from '@/src/constants';
import { OnboardingThemeStep } from '@/src/features/onboarding';
import { useState } from 'react';
import type { AppearanceSetupOutput } from './setupTypes';

export function AppearanceSetupSlice({
  currencyCode,
  initial,
  isCompleting,
  onContinue,
  onBack,
}: {
  readonly currencyCode: string;
  readonly initial?: AppearanceSetupOutput;
  readonly isCompleting: boolean;
  readonly onContinue: (output: AppearanceSetupOutput) => void;
  readonly onBack: () => void;
}) {
  const [themeId, setThemeId] = useState(initial?.themeId.value ?? ThemeIds.DEEP_SPACE);
  const [fontId, setFontId] = useState(initial?.fontId.value ?? FontIds.DEEP_SPACE);
  return (
    <OnboardingThemeStep
      currencyCode={currencyCode}
      themeId={themeId}
      fontId={fontId}
      onThemeChange={setThemeId}
      onFontChange={setFontId}
      onContinue={() =>
        onContinue({
          themeId: { value: themeId, source: 'user_entered' },
          fontId: { value: fontId, source: 'user_entered' },
        })
      }
      onBack={onBack}
      isCompleting={isCompleting}
    />
  );
}
