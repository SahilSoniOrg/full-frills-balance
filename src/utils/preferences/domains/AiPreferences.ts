import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

/** On-device AI preferences Interface. */
export class AiPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get isNativeAiEnabled(): boolean {
    return this.store.getSnapshot().isNativeAiEnabled ?? false;
  }

  setIsNativeAiEnabled(enabled: boolean): void {
    this.store.update({ isNativeAiEnabled: enabled });
  }

  get preferredAiModelId(): string | undefined {
    return this.store.getSnapshot().preferredAiModelId;
  }

  setPreferredAiModelId(modelId: string): void {
    this.store.update({ preferredAiModelId: modelId });
  }

  get aiInferenceMode(): 'single' | 'multi' {
    return this.store.getSnapshot().aiInferenceMode || 'multi';
  }

  setAiInferenceMode(mode: 'single' | 'multi'): void {
    this.store.update({ aiInferenceMode: mode });
  }

  observeNativeAiEnabled(): Observable<boolean> {
    return this.store.observe('isNativeAiEnabled');
  }
}
