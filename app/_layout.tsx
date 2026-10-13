import { RootLayout } from '@/src/features/app';
import type { ComponentType } from 'react';

let Layout: ComponentType = RootLayout;
// Static build gate keeps this native proof out of store bundles. The reader adds capability/auth gates.
if (process.env.EXPO_PUBLIC_E2E === '1') {
  // Conditional requires let Metro remove the proof and its destructive fixture from production.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readE2eLaunchConfig } = require('@/src/testing/e2eLaunchArgs');
  if (readE2eLaunchConfig()?.recoveryAction) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Layout = require('@/src/testing/RecoveryProofScreen').RecoveryProofScreen;
  }
}

export default Layout;
