import { Opacity } from '@/src/constants';

export type ArchivedPickerRowPresentation = {
  opacity: number;
  emphasizeIndicator: boolean;
};

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
