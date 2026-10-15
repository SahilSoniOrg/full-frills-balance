import { cryptoProvider } from '@/src/services/backup/cryptoProvider';
import { concatBytes, encodeUtf8 } from './tlv';
import { encodeRowHeader, RowHeader } from './rowHeader';

export type MerkleRow = RowHeader & { ciphertext: Uint8Array };
export type MerkleLeaf = Pick<RowHeader, 'table' | 'rowId'> & { hash: Uint8Array };
const EMPTY = new Uint8Array();
const cmp = (a: Uint8Array, b: Uint8Array): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

export async function computeMerkleRoot(
  rows: readonly MerkleRow[],
  rowCount: number,
): Promise<Uint8Array> {
  const leaves: MerkleLeaf[] = [];
  for (const row of rows) leaves.push({ ...row, hash: await hashRowLeaf(row) });
  return computeMerkleRootFromLeaves(leaves, rowCount);
}

export function hashRowLeaf(row: MerkleRow): Promise<Uint8Array> {
  return cryptoProvider.digest(concatBytes(Uint8Array.of(0), encodeRowHeader(row), row.ciphertext));
}

/** Unchanged rows retain only their authenticated leaf hash in the local index. */
export async function computeMerkleRootFromLeaves(
  leaves: readonly MerkleLeaf[],
  rowCount: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(rowCount) || rowCount < 0)
    throw new Error('rowCount must be a safe nonnegative integer');
  if (leaves.length !== rowCount) throw new Error('Merkle rowCount mismatch');
  if (leaves.some(leaf => leaf.hash.length !== 32)) throw new Error('Merkle hash must be 32 bytes');
  const ordered = [...leaves].sort(
    (a, b) =>
      cmp(encodeUtf8(a.table), encodeUtf8(b.table)) ||
      cmp(encodeUtf8(a.rowId), encodeUtf8(b.rowId)),
  );
  for (let i = 1; i < ordered.length; i += 1)
    if (ordered[i - 1].table === ordered[i].table && ordered[i - 1].rowId === ordered[i].rowId)
      throw new Error('Duplicate Merkle row key');
  if (!ordered.length) return cryptoProvider.digest(EMPTY);
  return treeHash(ordered.map(leaf => leaf.hash));
}

async function treeHash(hashes: readonly Uint8Array[]): Promise<Uint8Array> {
  if (hashes.length === 1) return hashes[0];
  let k = 1;
  while (k * 2 < hashes.length) k *= 2;
  return cryptoProvider.digest(
    concatBytes(
      Uint8Array.of(1),
      await treeHash(hashes.slice(0, k)),
      await treeHash(hashes.slice(k)),
    ),
  );
}
