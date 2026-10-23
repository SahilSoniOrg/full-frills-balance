import { FontIds } from '@/src/constants/design-tokens';
import { loadFontAssets } from '@/src/utils/fontAssets';
import {
  commitFontIdAfterLoad,
  ensureFontSetLoaded,
  isFontSetLoaded,
  resetLoadedFontSetsForTests,
} from '../loadFontSet';

jest.mock('@/src/utils/fontAssets', () => ({
  loadFontAssets: jest.fn(),
}));

describe('commitFontIdAfterLoad', () => {
  beforeEach(() => {
    resetLoadedFontSetsForTests();
    (loadFontAssets as jest.Mock).mockReset();
  });

  it('does not commit until the font files have loaded', async () => {
    let finishLoad: () => void = () => undefined;
    (loadFontAssets as jest.Mock).mockImplementation(
      () => new Promise<void>(resolve => (finishLoad = resolve)),
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
    const finishers: (() => void)[] = [];
    (loadFontAssets as jest.Mock).mockImplementation(
      () => new Promise<void>(resolve => finishers.push(resolve)),
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
    (loadFontAssets as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('loads a mapped scheme only once', async () => {
    await ensureFontSetLoaded(FontIds.DEEP_SPACE);
    await ensureFontSetLoaded(FontIds.DEEP_SPACE);
    expect(loadFontAssets).toHaveBeenCalledTimes(1);
  });

  it('allows a failed set to be retried without marking it loaded', async () => {
    (loadFontAssets as jest.Mock)
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(undefined);

    await expect(ensureFontSetLoaded(FontIds.IVY)).rejects.toThrow('load failed');
    expect(isFontSetLoaded(FontIds.IVY)).toBe(false);

    await ensureFontSetLoaded(FontIds.IVY);
    expect(isFontSetLoaded(FontIds.IVY)).toBe(true);
    expect(loadFontAssets).toHaveBeenCalledTimes(2);
  });
});
