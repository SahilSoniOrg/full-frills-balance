import type { SelectionTilePresentation } from '@/src/components/common/SelectionTileList';
import { Opacity, withOpacity } from '@/src/constants';

export type ArchivedPickerRowPresentation = {
  opacity: number;
  emphasizeIndicator: boolean;
};

/** Journal/account chip row: full-opacity archived tiles with dashed border. */
export function getArchivedAccountTilePresentation(
  isArchived: boolean,
  isSelected: boolean,
  accentColor: string,
): SelectionTilePresentation | undefined {
  if (!isArchived) return undefined;

  return {
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: isSelected ? withOpacity(accentColor, Opacity.medium) : undefined,
    showSelectedFill: false,
    showCheckmark: false,
    opacity: 1,
  };
}

/** Browse-all picker rows: muted unless pinned/selected. */
export function getArchivedAccountPickerRowPresentation(
  isArchived: boolean,
  isPinned: boolean,
): ArchivedPickerRowPresentation {
  if (!isArchived) {
    return { opacity: 1, emphasizeIndicator: false };
  }

  return {
    opacity: isPinned ? 1 : Opacity.medium,
    emphasizeIndicator: isPinned,
  };
}
