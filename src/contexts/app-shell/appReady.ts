import { FontId } from '@/src/constants/design-tokens';
import { requireShellContext } from '@/src/contexts/app-shell/requireShellContext';
import { createContext, useContext } from 'react';

export interface AppReadyValue {
  isLoading: boolean;
  isInitialized: boolean;
  fontsReady: boolean;
  loadedFontId: FontId | null;
  isDataHydrated: boolean;
  isAppReady: boolean;
  setFontsReady: (ready: boolean, fontId?: FontId) => void;
  setDataHydrated: (hydrated: boolean) => void;
}

export const AppReadyContext = createContext<AppReadyValue | undefined>(undefined);

export function useAppReady(): AppReadyValue {
  return requireShellContext(useContext(AppReadyContext), 'useAppReady');
}
