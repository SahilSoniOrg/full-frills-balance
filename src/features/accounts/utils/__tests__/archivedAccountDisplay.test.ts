import {
  getArchivedAccountPickerRowPresentation,
  getArchivedAccountTilePresentation,
} from '@/src/features/accounts/utils/archivedAccountDisplay';
import { Opacity, withOpacity } from '@/src/constants';

describe('archivedAccountDisplay', () => {
  it('tiles stay full opacity with dashed border and no checkmark', () => {
    expect(getArchivedAccountTilePresentation(true, false, '#336699')).toEqual({
      borderStyle: 'dashed',
      borderWidth: 2,
      borderColor: undefined,
      showSelectedFill: false,
      showCheckmark: false,
      opacity: 1,
    });
    expect(getArchivedAccountTilePresentation(true, true, '#336699')?.borderColor).toBe(
      withOpacity('#336699', Opacity.medium),
    );
    expect(getArchivedAccountTilePresentation(false, true, '#336699')).toBeUndefined();
  });

  it('picker rows mute unselected archived accounts', () => {
    expect(getArchivedAccountPickerRowPresentation(true, false)).toEqual({
      opacity: Opacity.medium,
      emphasizeIndicator: false,
    });
    expect(getArchivedAccountPickerRowPresentation(true, true)).toEqual({
      opacity: 1,
      emphasizeIndicator: true,
    });
    expect(getArchivedAccountPickerRowPresentation(false, false)).toEqual({
      opacity: 1,
      emphasizeIndicator: false,
    });
  });
});
