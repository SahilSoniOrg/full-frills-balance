import {
  type CaptureLoadOptions,
  type CaptureSettingsState,
} from '@/src/features/settings/hooks/captureWorkspaceStore';
import { useCaptureWorkspace } from '@/src/features/settings/hooks/useCaptureWorkspace';
import type { WorkplaceId } from '@/src/types/ids';

export function useCaptureSettings(options: CaptureLoadOptions = {}): CaptureSettingsState & {
  workplaceId: WorkplaceId;
  refresh: () => Promise<void>;
} {
  const workspace = useCaptureWorkspace(options);
  return {
    workplaceId: workspace.workplaceId,
    ...workspace.settings,
    refresh: workspace.refresh,
  };
}
