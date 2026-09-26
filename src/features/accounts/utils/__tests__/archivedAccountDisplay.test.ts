import { getArchivedAccountPickerRowPresentation } from '@/src/components/accounts/archivedAccountDisplay';
import { Opacity } from '@/src/constants';

describe('archivedAccountDisplay', () => {
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
