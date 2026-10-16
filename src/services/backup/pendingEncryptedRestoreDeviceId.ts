import { storage } from '@/src/utils/storage';

const KEY = 'ffb-pending-encrypted-restore-device-v1';

export async function loadPendingEncryptedRestoreDeviceId(): Promise<string | null> {
  const value = storage.getString(KEY);
  return value?.trim() ? value.trim() : null;
}

export async function savePendingEncryptedRestoreDeviceId(deviceId: string): Promise<void> {
  storage.set(KEY, deviceId);
}

export async function clearPendingEncryptedRestoreDeviceId(): Promise<void> {
  storage.remove(KEY);
}
