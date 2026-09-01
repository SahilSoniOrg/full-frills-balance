import { asWorkplaceId } from '@/src/types/ids';
import { RestorePublicationClaims } from '../restorePublicationClaims';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => values.set(key, value),
  };
}

describe('RestorePublicationClaims', () => {
  const operationId = asWorkplaceId('restore-operation');

  it('persists the claim before publication and permits the same retry', () => {
    const storage = memoryStorage();
    const claims = new RestorePublicationClaims(storage);

    claims.claim(operationId, 'fingerprint-a');
    expect(() => claims.claim(operationId, 'fingerprint-a')).not.toThrow();
    expect(storage.getString('restore_publication_claims_v1')).toContain('fingerprint-a');
  });

  it('rejects a different source for an existing operation', () => {
    const claims = new RestorePublicationClaims(memoryStorage());
    claims.claim(operationId, 'fingerprint-a');
    expect(() => claims.claim(operationId, 'fingerprint-b')).toThrow('different backup source');
  });
});
