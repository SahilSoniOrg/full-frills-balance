import { hashLegacySmsFingerprint } from './smsFingerprintHash';

const EXPLICIT_SMS_RAW_KEYS = new Set([
  'originalsmsbody',
  'originalsmssender',
  'rawsmsbody',
  'rawsmssender',
]);
const SMS_METADATA_ALIASES = new Set([
  'rawbody',
  'senderaddress',
  'smsbody',
  'smssender',
  'sender',
  'body',
  'message',
  'messagebody',
]);
const SMS_RAW_AUDIT_KEYS = new Set([
  'originalsmsbody',
  'originalsmssender',
  'rawsmsbody',
  'rawsmssender',
  'rawbody',
  'senderaddress',
]);

function normalizedKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase();
}

function hasSmsMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSmsMarker);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) => {
    const normalized = normalizedKey(key);
    return (
      normalized === 'smsfingerprint' ||
      normalized === 'originalsmsid' ||
      (normalized === 'importsource' && entry === 'sms') ||
      EXPLICIT_SMS_RAW_KEYS.has(normalized) ||
      hasSmsMarker(entry)
    );
  });
}

function containsExplicitSmsRawKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsExplicitSmsRawKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, entry]) =>
      EXPLICIT_SMS_RAW_KEYS.has(normalizedKey(key)) || containsExplicitSmsRawKey(entry),
  );
}

function scrubObject(
  value: unknown,
  keysToRemove: ReadonlySet<string>,
  forceSmsOwned = false,
): unknown {
  if (Array.isArray(value))
    return value.map(item => scrubObject(item, keysToRemove, forceSmsOwned));
  if (value === null || typeof value !== 'object') return value;

  const cleaned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizedKey(key);
    if (EXPLICIT_SMS_RAW_KEYS.has(normalized) || keysToRemove.has(normalized)) continue;
    if (normalized === 'smsfingerprint' && typeof entry === 'string') {
      cleaned[key] = hashLegacySmsFingerprint(entry);
    } else if (normalized === 'metadatajson' && typeof entry === 'string') {
      cleaned[key] = sanitizeSmsMetadataJson(entry, forceSmsOwned);
    } else {
      cleaned[key] = scrubObject(entry, keysToRemove, forceSmsOwned);
    }
  }
  return cleaned;
}

export function sanitizeSmsMetadataJson(
  raw?: string | null,
  forceSmsOwned = false,
): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    const smsOwned = forceSmsOwned || hasSmsMarker(parsed);
    if (!smsOwned && !containsExplicitSmsRawKey(parsed)) return raw;
    const cleaned = scrubObject(
      parsed,
      smsOwned ? SMS_METADATA_ALIASES : new Set<string>(),
      smsOwned,
    );
    return JSON.stringify(cleaned);
  } catch {
    return undefined;
  }
}

export function sanitizeSmsAuditChanges(raw: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return JSON.stringify(scrubObject(parsed, SMS_RAW_AUDIT_KEYS));
  } catch {
    return undefined;
  }
}

/** Hash legacy identities without discarding their locally retained source content. */
export function hashSmsMetadataFingerprints(raw?: string | null): string | undefined {
  if (!raw) return raw ?? undefined;
  const hashValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(hashValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const normalized = normalizedKey(key);
        if (normalized === 'smsfingerprint' && typeof entry === 'string') {
          return [key, hashLegacySmsFingerprint(entry)];
        }
        if (normalized === 'metadatajson' && typeof entry === 'string') {
          return [key, hashSmsMetadataFingerprints(entry)];
        }
        return [key, hashValue(entry)];
      }),
    );
  };
  try {
    return JSON.stringify(hashValue(JSON.parse(raw)));
  } catch {
    return raw;
  }
}
