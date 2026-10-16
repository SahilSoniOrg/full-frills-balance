/** Worker-only device vault. Main thread must not import this module (see check-native-key-boundary). */

export const WORKER_DEVICE_VAULT_DB = 'ffb-key-crypto-device-vault-v1';
export const WORKER_WRAP_KEY_DB = 'ffb-key-crypto-wrap-key-v1';

const DEVICE_KEY_NAME = /^device_private_key_v1_[a-f0-9]{64}$/;
const WRAP_KEY_ID = 'full-frills-key-crypto.device-wrap.v1';

type EncryptedRecord = {
  readonly version: 1;
  readonly algorithm: 'AES-256-GCM';
  readonly nonce: string;
  readonly ciphertext: string;
};

function binding(name: string): Uint8Array {
  return new TextEncoder().encode(`full-frills-device-vault:1:${name}`);
}

function openDb(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error ?? new Error('FFB_KEY_VAULT_UNAVAILABLE'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => upgrade(request.result);
  });
}

async function deviceDb(): Promise<IDBDatabase> {
  return openDb(WORKER_DEVICE_VAULT_DB, 1, db => {
    if (!db.objectStoreNames.contains('records')) db.createObjectStore('records');
  });
}

async function wrapDb(): Promise<IDBDatabase> {
  return openDb(WORKER_WRAP_KEY_DB, 1, db => {
    if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    request.onerror = () => reject(request.error ?? new Error('FFB_KEY_VAULT_UNAVAILABLE'));
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
}

function idbPut(db: IDBDatabase, store: string, key: IDBValidKey, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.onerror = () => reject(tx.error ?? new Error('FFB_KEY_VAULT_UNAVAILABLE'));
    tx.oncomplete = () => resolve();
    tx.objectStore(store).put(value, key);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.onerror = () => reject(tx.error ?? new Error('FFB_KEY_VAULT_UNAVAILABLE'));
    tx.oncomplete = () => resolve();
    tx.objectStore(store).delete(key);
  });
}

async function hasDeviceRecords(): Promise<boolean> {
  const db = await deviceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const request = tx.objectStore('records').count();
    request.onerror = () => reject(request.error ?? new Error('FFB_KEY_VAULT_UNAVAILABLE'));
    request.onsuccess = () => resolve((request.result ?? 0) > 0);
  });
}

async function getOrCreateWrapKey(recovering: boolean): Promise<CryptoKey> {
  const db = await wrapDb();
  const existing = await idbGet<CryptoKey>(db, 'keys', WRAP_KEY_ID);
  if (existing) return existing;
  if (!recovering && (await hasDeviceRecords())) throw new Error('FFB_KEY_RECOVERY_REQUIRED');
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await idbPut(db, 'keys', WRAP_KEY_ID, key);
  return key;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validateName(name: string): void {
  if (!DEVICE_KEY_NAME.test(name)) throw new Error('FFB_KEY_VAULT_UNAVAILABLE');
}

async function decryptRecord(name: string, record: EncryptedRecord): Promise<Uint8Array> {
  if (
    record.version !== 1 ||
    record.algorithm !== 'AES-256-GCM' ||
    !record.nonce ||
    !record.ciphertext
  )
    throw new Error('FFB_KEY_RECOVERY_REQUIRED');
  const nonce = base64ToBytes(record.nonce);
  const ciphertext = base64ToBytes(record.ciphertext);
  if (nonce.length !== 12 || ciphertext.length !== 48) throw new Error('FFB_KEY_RECOVERY_REQUIRED');
  const wrapKey = await getOrCreateWrapKey(false);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(nonce), additionalData: new Uint8Array(binding(name)) },
      wrapKey,
      new Uint8Array(ciphertext),
    );
    const bytes = new Uint8Array(plain);
    if (bytes.length !== 32) throw new Error('FFB_KEY_RECOVERY_REQUIRED');
    return bytes;
  } catch {
    throw new Error('FFB_KEY_RECOVERY_REQUIRED');
  }
}

async function encryptRecord(
  name: string,
  key: Uint8Array,
  recovering: boolean,
): Promise<EncryptedRecord> {
  if (key.length !== 32) throw new Error('FFB_KEY_VAULT_UNAVAILABLE');
  const wrapKey = await getOrCreateWrapKey(recovering);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonce), additionalData: new Uint8Array(binding(name)) },
    wrapKey,
    new Uint8Array(key),
  );
  const bytes = new Uint8Array(ciphertext);
  if (bytes.length !== 48) throw new Error('FFB_KEY_VAULT_UNAVAILABLE');
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(bytes),
  };
}

export async function loadDeviceKey(name: string): Promise<Uint8Array | null> {
  validateName(name);
  const db = await deviceDb();
  const encoded = await idbGet<string>(db, 'records', name);
  if (encoded === undefined) return null;
  try {
    const record = JSON.parse(encoded) as EncryptedRecord;
    return await decryptRecord(name, record);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'FFB_KEY_RECOVERY_REQUIRED' || message === 'FFB_KEY_VAULT_UNAVAILABLE')
      throw error;
    throw new Error('FFB_KEY_RECOVERY_REQUIRED');
  }
}

export async function saveDeviceKey(
  name: string,
  key: Uint8Array,
  recovering = false,
): Promise<void> {
  validateName(name);
  const existing = await loadDeviceKey(name);
  if (existing) {
    let same = existing.length === key.length;
    if (same) {
      for (let index = 0; index < key.length; index += 1) {
        if (existing[index] !== key[index]) same = false;
      }
    }
    existing.fill(0);
    if (!same) throw new Error('Device key replacement is forbidden');
    return;
  }
  const record = await encryptRecord(name, key, recovering);
  const db = await deviceDb();
  await idbPut(db, 'records', name, JSON.stringify(record));
  const checked = await loadDeviceKey(name);
  if (!checked) throw new Error('Device key readback failed');
  let same = checked.length === key.length;
  if (same) {
    for (let index = 0; index < key.length; index += 1) {
      if (checked[index] !== key[index]) same = false;
    }
  }
  checked.fill(0);
  if (!same) throw new Error('Device key readback failed');
}

export async function removeDeviceKey(name: string): Promise<void> {
  validateName(name);
  const db = await deviceDb();
  await idbDelete(db, 'records', name);
}

/** Hooks consumed by the Emscripten bridge (`Module.ffbVault`). */
export const ffbVaultHooks = {
  load: loadDeviceKey,
  save: (name: string, bytes: Uint8Array) => saveDeviceKey(name, bytes, false),
  remove: removeDeviceKey,
};
