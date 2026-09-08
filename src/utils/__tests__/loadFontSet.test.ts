import { FontIds } from '@/src/constants/design-tokens';
import * as Font from 'expo-font';
import {
  commitFontIdAfterLoad,
  ensureFontSetLoaded,
  isFontSetLoaded,
  resetLoadedFontSetsForTests,
} from '../loadFontSet';

describe('commitFontIdAfterLoad', () => {
  beforeEach(() => {
    resetLoadedFontSetsForTests();
    (Font.loadAsync as jest.Mock).mockReset();
  });

  it('does not commit until the font files have loaded', async () => {
    let finishLoad: (value?: unknown) => void = () => undefined;
    (Font.loadAsync as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve => {
          finishLoad = resolve;
        }),
    );
    const commit = jest.fn();

    const pending = commitFontIdAfterLoad(FontIds.IVY, commit);

    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
    expect(isFontSetLoaded(FontIds.IVY)).toBe(false);

    finishLoad();
    await pending;

    expect(commit).toHaveBeenCalledWith(FontIds.IVY);
    expect(isFontSetLoaded(FontIds.IVY)).toBe(true);
  });

  it('commits only the last selection when switching before load finishes', async () => {
    const finishers: ((value?: unknown) => void)[] = [];
    (Font.loadAsync as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve => {
          finishers.push(resolve);
        }),
    );
    const commit = jest.fn();

    const first = commitFontIdAfterLoad(FontIds.IVY, commit);
    const second = commitFontIdAfterLoad(FontIds.EDITORIAL, commit);

    finishers[0]?.();
    await first;
    expect(commit).not.toHaveBeenCalled();

    finishers[1]?.();
    await second;
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(FontIds.EDITORIAL);
  });
});

describe('ensureFontSetLoaded', () => {
  beforeEach(() => {
    resetLoadedFontSetsForTests();
    (Font.loadAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('loads a mapped scheme only once', async () => {
    await ensureFontSetLoaded(FontIds.DEEP_SPACE);
    await ensureFontSetLoaded(FontIds.DEEP_SPACE);
    expect(Font.loadAsync).toHaveBeenCalledTimes(1);
  });
});
