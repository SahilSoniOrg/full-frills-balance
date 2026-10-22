/**
 * Web Worker entry — bundled separately from the app. Do not import from the main thread.
 */
import { workerBootstrap } from '../../../modules/expo-key-crypto/web/keyCryptoWorker';

workerBootstrap(self);
