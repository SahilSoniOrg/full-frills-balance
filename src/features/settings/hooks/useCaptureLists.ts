import {
  type CaptureLoadOptions,
  type CaptureListsState,
} from '@/src/features/settings/hooks/captureWorkspaceStore';
import { useCaptureWorkspace } from '@/src/features/settings/hooks/useCaptureWorkspace';
import type { WorkplaceId } from '@/src/types/ids';

export function useCaptureLists(options: CaptureLoadOptions = {}): CaptureListsState & {
  workplaceId: WorkplaceId;
  refresh: () => Promise<void>;
} {
  const workspace = useCaptureWorkspace(options);
  return {
    workplaceId: workspace.workplaceId,
    ...workspace.lists,
    refresh: workspace.refresh,
  };
}
