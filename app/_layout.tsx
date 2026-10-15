import { RootLayout } from '@/src/features/app';
import type { ComponentType } from 'react';

let Layout: ComponentType = RootLayout;

if (__DEV__ && process.env.EXPO_PUBLIC_ZSTD_PROOF === '1') {
  Layout = require('../src/testing/ZstdProofScreen').ZstdProofScreen as ComponentType;
}

export default Layout;
