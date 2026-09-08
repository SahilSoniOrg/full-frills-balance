import { FontIds } from '@/src/constants/design-tokens';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { resetLoadedFontSetsForTests } from '@/src/utils/loadFontSet';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Font from 'expo-font';
import { useFonts } from '../useFonts';

jest.mock('@/src/contexts/app-shell/appReady', () => ({
  useAppReady: jest.fn(),
}));
jest.mock('@/src/hooks/useThemePrefs', () => ({
  useThemePrefs: jest.fn(),
}));

describe('useFonts', () => {
  const setFontsReady = jest.fn();

  beforeEach(() => {
    resetLoadedFontSetsForTests();
    setFontsReady.mockReset();
    (useAppReady as jest.Mock).mockReturnValue({ setFontsReady });
    (useThemePrefs as jest.Mock).mockReturnValue({ fontId: FontIds.DEEP_SPACE });
    (Font.loadAsync as jest.Mock).mockReset();
  });

  it('does not mark the default onboarding font ready until the files are loaded', async () => {
    let finishLoad: (value?: unknown) => void = () => undefined;
    (Font.loadAsync as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve => {
          finishLoad = resolve;
        }),
    );

    renderHook(() => useFonts());

    await act(async () => {
      await Promise.resolve();
    });
    expect(setFontsReady).not.toHaveBeenCalled();

    await act(async () => {
      finishLoad();
    });
    await waitFor(() => expect(setFontsReady).toHaveBeenCalledWith(true, FontIds.DEEP_SPACE));
  });
});
