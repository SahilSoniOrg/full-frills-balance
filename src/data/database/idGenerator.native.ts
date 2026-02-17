import * as Crypto from 'expo-crypto';
/**
 * Native ID Generator
 * 
 * Uses react-native-quick-crypto for 58x faster ID generation on iOS/Android.
 */
export const generator = () => Crypto.randomUUID();
