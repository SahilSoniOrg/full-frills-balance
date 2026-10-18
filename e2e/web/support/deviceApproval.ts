import type { Page } from '@playwright/test';
import type { LocalUserKeys } from '../../../src/services/backup/keyHierarchyRecords';

declare global {
  interface Window {
    __deviceApprovalTestExecute: (operation: string, request: unknown) => Promise<unknown>;
  }
}

/** Test-only access to the real app worker. Never transfers private keys or recovery seeds. */
export async function installDeviceApprovalTransport(page: Page) {
  await page.addInitScript(() => {
    const BaseWorker = Worker;
    let worker: Worker | undefined;
    let sequence = 0;
    window.Worker = class extends BaseWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('keyCrypto.worker')) worker = this;
      }
    };
    window.__deviceApprovalTestExecute = (operation, request) => {
      if (!worker) throw new Error('App key worker is not ready');
      const target = worker;
      const id = `device-approval-test-${++sequence}`;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          target.removeEventListener('message', receive);
          reject(new Error('Device approval test request timed out'));
        }, 15000);
        function receive(event: MessageEvent) {
          if (event.data.id !== id) return;
          clearTimeout(timeout);
          target.removeEventListener('message', receive);
          if (event.data.ok) resolve(event.data.result);
          else reject(new Error(event.data.error));
        }
        target.addEventListener('message', receive);
        target.postMessage({ id, type: 'execute', operation, request });
      });
    };
  });
}

export async function deviceExecute<T>(
  page: Page,
  operation: string,
  request: unknown,
): Promise<T> {
  return page.evaluate(
    ({ operation, request }) => window.__deviceApprovalTestExecute(operation, request),
    { operation, request },
  ) as Promise<T>;
}

/** Only public metadata/ciphertext. The Device vault is never inspected or copied. */
export async function readPublicUserRecord(page: Page): Promise<LocalUserKeys> {
  return page.evaluate(async () => {
    const session = JSON.parse(localStorage.getItem('ffb-encryption-setup-session-v1') ?? 'null');
    if (!session) throw new Error('No User session');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('ffb-key-ciphertext-state-v1', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const read = db
          .transaction('scopes')
          .objectStore('scopes')
          .get(JSON.stringify(['user', session.userId, session.deviceId]));
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  }) as Promise<LocalUserKeys>;
}

/** Test bootstrap for an already approved bundle; production enrollment remains separate. */
export async function installApprovedPublicRecord(page: Page, user: LocalUserKeys) {
  await page.evaluate(async user => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('ffb-key-ciphertext-state-v1', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('scopes');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('scopes', 'readwrite');
        tx.objectStore('scopes').put(user, JSON.stringify(['user', user.userId, user.deviceId]));
        tx.objectStore('scopes').put(
          {
            deviceId: user.deviceId,
            publicIdentity: user.publicIdentity,
            recoveryConfirmed: true,
          },
          JSON.stringify(['identity', user.userId]),
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      localStorage.setItem(
        'ffb-encryption-setup-session-v1',
        JSON.stringify({
          formatVersion: 1,
          intent: 'recover-user',
          userId: user.userId,
          deviceId: user.deviceId,
          userKeyFingerprint: user.userKeyFingerprint,
        }),
      );
    } finally {
      db.close();
    }
  }, user);
}

export async function showApprovalTestStep(page: Page, text: string) {
  await page.evaluate(text => {
    let banner = document.getElementById('device-approval-test-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'device-approval-test-banner';
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:99999;background:#14251e;color:white;padding:12px;font:16px system-ui;pointer-events:none;text-align:center';
      document.body.appendChild(banner);
    }
    banner.textContent = `TEST HARNESS · ${text}`;
  }, text);
}
