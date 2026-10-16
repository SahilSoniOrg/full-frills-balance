import type { KeyCiphertextStateStore } from './keyCiphertextStateStore';

const DB_NAME = 'ffb-key-ciphertext-state-v1';
const STORE = 'scopes';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error ?? new Error('IDB open failed'));
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = run(store);
    request.onerror = () => reject(request.error ?? new Error('IDB request failed'));
    request.onsuccess = () => resolve(request.result as T);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('IDB transaction failed'));
  });
}

export const keyCiphertextStateStore: KeyCiphertextStateStore = {
  read: async scope => {
    const value = await withStore('readonly', store => store.get(scope));
    return value === undefined ? null : value;
  },
  write: (scope, value) =>
    withStore('readwrite', store => store.put(value, scope)).then(() => undefined),
  remove: scope => withStore('readwrite', store => store.delete(scope)).then(() => undefined),
};
