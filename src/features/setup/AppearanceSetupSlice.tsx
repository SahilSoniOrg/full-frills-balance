import { FontIds, ThemeIds } from '@/src/constants';
import { AppearanceThemeStep } from './AppearanceThemeStep';
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
    <AppearanceThemeStep
      currencyCode={currencyCode}
      themeId={themeId}
      fontId={fontId}
      onThemeChange={setThemeId}
      onFontChange={setFontId}
      onContinue={() =>
        onContinue({
          themeId: {
            value: themeId,
            source: initial?.themeId.value === themeId ? initial.themeId.source : 'user_entered',
          },
          fontId: {
            value: fontId,
            source: initial?.fontId.value === fontId ? initial.fontId.source : 'user_entered',
          },
        })
      }
      onBack={onBack}
      isCompleting={isCompleting}
    />
  );
}
