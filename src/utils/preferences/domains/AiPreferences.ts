import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

/** On-device AI preferences Interface. */
export class AiPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get isNativeAiEnabled(): boolean {
    return this.store.isNativeAiEnabled;
  }

  setIsNativeAiEnabled(enabled: boolean): void {
    this.store.setIsNativeAiEnabled(enabled);
  }

  get preferredAiModelId(): string | undefined {
    return this.store.preferredAiModelId;
  }

  setPreferredAiModelId(modelId: string): void {
    this.store.setPreferredAiModelId(modelId);
  }

  get aiInferenceMode(): 'single' | 'multi' {
    return this.store.aiInferenceMode;
  }

  setAiInferenceMode(mode: 'single' | 'multi'): void {
    this.store.setAiInferenceMode(mode);
  }

  observeNativeAiEnabled(): Observable<boolean> {
    return this.store.observe('isNativeAiEnabled');
  }
}
