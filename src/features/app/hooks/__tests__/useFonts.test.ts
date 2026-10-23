import { FontIds } from '@/src/constants/design-tokens';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { ensureFontSetLoaded } from '@/src/utils/loadFontSet';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useFonts } from '../useFonts';

jest.mock('@/src/contexts/app-shell/appReady', () => ({
  useAppReady: jest.fn(),
}));
jest.mock('@/src/hooks/useThemePrefs', () => ({
  useThemePrefs: jest.fn(),
}));
jest.mock('@/src/utils/loadFontSet', () => ({
  ensureFontSetLoaded: jest.fn(),
}));

describe('useFonts', () => {
  const setFontsReady = jest.fn();

  beforeEach(() => {
    setFontsReady.mockReset();
    (ensureFontSetLoaded as jest.Mock).mockReset().mockResolvedValue(undefined);
    (useAppReady as jest.Mock).mockReturnValue({ setFontsReady });
    (useThemePrefs as jest.Mock).mockReturnValue({ fontId: FontIds.DEEP_SPACE });
  });

  it('does not mark the default onboarding font ready until the files are loaded', async () => {
    let finishLoad: () => void = () => undefined;
    (ensureFontSetLoaded as jest.Mock).mockImplementation(
      () => new Promise<void>(resolve => (finishLoad = resolve)),
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

  it('loads the default font set after the selected set fails', async () => {
    (useThemePrefs as jest.Mock).mockReturnValue({ fontId: FontIds.IVY });
    (ensureFontSetLoaded as jest.Mock)
      .mockRejectedValueOnce(new Error('selected set failed'))
      .mockResolvedValueOnce(undefined);

    renderHook(() => useFonts());

    await waitFor(() => expect(setFontsReady).toHaveBeenCalledWith(true, FontIds.DEEP_SPACE));
    expect(ensureFontSetLoaded).toHaveBeenNthCalledWith(1, FontIds.IVY);
    expect(ensureFontSetLoaded).toHaveBeenNthCalledWith(2, FontIds.DEEP_SPACE);
  });

  it('marks startup complete with no loaded font when both sets fail', async () => {
    (useThemePrefs as jest.Mock).mockReturnValue({ fontId: FontIds.IVY });
    (ensureFontSetLoaded as jest.Mock).mockRejectedValue(new Error('font load failed'));

    renderHook(() => useFonts());

    await waitFor(() => expect(setFontsReady).toHaveBeenCalledWith(true, null));
  });
});
