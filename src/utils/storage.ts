import { createMMKV } from 'react-native-mmkv';

// Centralize MMKV instance with a specific ID for better isolation
export const storage = createMMKV({ id: 'full-frills-balance-storage' });
