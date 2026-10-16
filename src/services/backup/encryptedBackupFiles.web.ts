import type { EncryptedBackupFiles } from './encryptedBackupFiles';

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Backup file read failed'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

async function pickEncryptedBackupZip(): Promise<Uint8Array | null> {
  if (typeof document === 'undefined')
    throw new Error('Encrypted backup pickers require a browser');
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/zip,.zip';
    input.style.display = 'none';
    const cleanup = () => input.remove();
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      void readFileAsArrayBuffer(file)
        .then(buffer => resolve(new Uint8Array(buffer)))
        .catch(reject);
    });
    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

async function exportEncryptedBackupZip(archive: Uint8Array): Promise<boolean> {
  if (typeof document === 'undefined')
    throw new Error('Encrypted backup export requires a browser');
  const filename = `full-frills-encrypted-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  const blob = new Blob([new Uint8Array(archive)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

export const encryptedBackupFiles: EncryptedBackupFiles = {
  pickEncryptedBackupZip,
  exportEncryptedBackupZip,
};
