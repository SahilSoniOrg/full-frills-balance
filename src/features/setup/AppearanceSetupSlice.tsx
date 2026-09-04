import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants';
import { AppearanceThemeStep } from './AppearanceThemeStep';
import { useState } from 'react';
import type { AppearanceSetupOutput } from './setupTypes';

export function AppearanceSetupSlice({
  currencyCode,
  initial,
  isCompleting,
  onContinue,
  onBack,
  onPreviewChange,
}: {
  readonly currencyCode: string;
  readonly initial?: AppearanceSetupOutput;
  readonly isCompleting: boolean;
  readonly onContinue: (output: AppearanceSetupOutput) => void;
  readonly onBack: () => void;
  readonly onPreviewChange: (preview: { themeId: ThemeId; fontId: FontId }) => void;
}) {
  const [themeId, setThemeId] = useState(initial?.themeId.value ?? ThemeIds.DEEP_SPACE);
  const [fontId, setFontId] = useState(initial?.fontId.value ?? FontIds.DEEP_SPACE);

  return (
    <AppearanceThemeStep
      currencyCode={currencyCode}
      themeId={themeId}
      fontId={fontId}
      onThemeChange={next => {
        setThemeId(next);
        onPreviewChange({ themeId: next, fontId });
      }}
      onFontChange={next => {
        setFontId(next);
        onPreviewChange({ themeId, fontId: next });
      }}
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
