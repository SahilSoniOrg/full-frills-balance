import { useEffect } from 'react';
import { blockUpdateRestart } from '@/src/services/update/updateRestartGuard';

export function useUpdateRestartGuard(blocked: boolean): void {
  useEffect(() => {
    if (blocked) return blockUpdateRestart();
  }, [blocked]);
}
