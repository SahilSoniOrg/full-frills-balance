import { computeSmsFingerprint } from '@/src/services/sms/pipeline/smsFingerprint';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import {
  hashSmsMetadataFingerprints,
  sanitizeSmsAuditChanges,
  sanitizeSmsMetadataJson,
} from '@/src/utils/smsPrivateMetadata';

describe('SMS privacy fingerprints and metadata', () => {
  it('hashes legacy and nested metadata identities while retaining original source content', () => {
    const raw = JSON.stringify({
      rawBody: 'Original transaction',
      originalSmsSender: 'BANK',
      metadataJson: JSON.stringify({ body: 'Keep this source', smsFingerprint: 'bank::body::7' }),
    });
    const hashed = hashSmsMetadataFingerprints(raw)!;
    const data = JSON.parse(hashed);
    expect(data.rawBody).toBe('Original transaction');
    expect(data.originalSmsSender).toBe('BANK');
    expect(JSON.parse(data.metadataJson)).toEqual({
      body: 'Keep this source',
      smsFingerprint: hashLegacySmsFingerprint('bank::body::7'),
    });
    expect(hashSmsMetadataFingerprints(hashed)).toBe(hashed);
    expect(hashSmsMetadataFingerprints('{broken source')).toBe('{broken source');
  });
  it('uses standard SHA-256 and never persists sender or message text in a fingerprint', () => {
    expect(hashLegacySmsFingerprint('abc')).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const fingerprint = computeSmsFingerprint(
      'PrivateBank',
      'PrivateMerchant spent 500',
      86_400_000,
    );
    expect(fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain('PrivateBank');
    expect(fingerprint).not.toContain('PrivateMerchant');
  });

  it('rehashes malformed digest-looking legacy fingerprints instead of retaining them', () => {
    const malformed = 'sha256::PrivateMerchant spent 500::7';
    const hashedMalformed = hashLegacySmsFingerprint(malformed);
    expect(hashedMalformed).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashLegacySmsFingerprint(hashedMalformed)).toBe(hashedMalformed);
    const validDigest = `sha256:${'a'.repeat(64)}`;
    expect(hashLegacySmsFingerprint(validDigest)).toBe(validDigest);
  });

  it('scrubs SMS-owned metadata while leaving non-SMS body fields unchanged', () => {
    const smsMetadata = sanitizeSmsMetadataJson(
      JSON.stringify({
        importSource: 'sms',
        originalSmsBody: 'PrivateMerchant spent 500',
        sender: 'PrivateBank',
        smsFingerprint: 'privatebank::privatemerchant spent 500::7',
        parsedMerchant: 'Merchant',
        referenceNumber: 'REF123',
        amount: 500,
      }),
    );
    const parsedSms = JSON.parse(smsMetadata!);
    expect(JSON.stringify(parsedSms)).not.toContain('PrivateMerchant');
    expect(JSON.stringify(parsedSms)).not.toContain('PrivateBank');
    expect(parsedSms.parsedMerchant).toBe('Merchant');
    expect(parsedSms.referenceNumber).toBe('REF123');
    expect(parsedSms.amount).toBe(500);
    expect(parsedSms.smsFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);

    const otherMetadata = JSON.stringify({
      source: 'voice',
      body: 'user-authored note',
      sender: 'local',
    });
    expect(sanitizeSmsMetadataJson(otherMetadata)).toBe(otherMetadata);
  });

  it('removes explicit SMS fields from audit changes but preserves financial state and notes', () => {
    const sanitized = JSON.parse(
      sanitizeSmsAuditChanges(
        JSON.stringify({
          before: { amount: 500, notes: 'Keep this note', originalSmsBody: 'PrivateMerchant' },
          after: { amount: 600, originalSmsSender: 'PrivateBank', smsFingerprint: 'bank::body::7' },
        }),
      )!,
    );
    expect(sanitized.before).toEqual({ amount: 500, notes: 'Keep this note' });
    expect(sanitized.after.amount).toBe(600);
    expect(sanitized.after.smsFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(sanitized)).not.toContain('PrivateMerchant');
    expect(JSON.stringify(sanitized)).not.toContain('PrivateBank');
  });
});
