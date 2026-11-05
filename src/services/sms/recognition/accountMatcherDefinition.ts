import { AppConfig } from '@/src/constants/app-config';
import type { AccountMatcherDefinitionV1 } from '@/src/types/accountMatcher';
import { normalizeMatcherText } from './accountMatcherNormalization';
import { validateSafeAccountMatcherRegex } from './safeAccountMatcherRegex';

export function parseAccountMatcherDefinition(value: unknown): AccountMatcherDefinitionV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if (d.version !== 1) return null;
  if (d.flow !== undefined && d.flow !== 'incoming' && d.flow !== 'outgoing') return null;
  if (d.sender !== undefined) {
    if (!d.sender || typeof d.sender !== 'object' || Array.isArray(d.sender)) return null;
    const s = d.sender as Record<string, unknown>;
    if (s.op !== 'contains' || typeof s.value !== 'string') return null;
  }
  if (d.body !== undefined) {
    if (!d.body || typeof d.body !== 'object' || Array.isArray(d.body)) return null;
    const b = d.body as Record<string, unknown>;
    if (b.kind === 'fragments') {
      if (!Array.isArray(b.fragments) || !b.fragments.every(x => typeof x === 'string'))
        return null;
    } else if (b.kind === 'regex' && typeof b.pattern === 'string') {
      /* parsed, not enabled in Phase 1 */
    } else return null;
  }
  return value as AccountMatcherDefinitionV1;
}
export function parseStoredMatcherDefinition(
  definitionJson: string,
): AccountMatcherDefinitionV1 | null {
  try {
    return parseAccountMatcherDefinition(JSON.parse(definitionJson));
  } catch {
    return null;
  }
}
export function validateAccountMatcherDefinition(value: unknown): {
  valid: boolean;
  error?: string;
  definition?: AccountMatcherDefinitionV1;
} {
  const d = parseAccountMatcherDefinition(value);
  if (!d) return { valid: false, error: 'Malformed account matcher definition' };
  if (d.body?.kind === 'regex') {
    const result = validateSafeAccountMatcherRegex(d.body.pattern);
    if (!result.valid) return { valid: false, error: result.error };
  }
  if (d.sender && !normalizeMatcherText(d.sender.value))
    return { valid: false, error: 'Sender condition cannot be empty' };
  if (d.body?.kind === 'fragments') {
    const maxFragments = AppConfig.input.sms.maxAccountMatcherFragments;
    if (d.body.fragments.length < 1 || d.body.fragments.length > maxFragments)
      return { valid: false, error: `Choose between 1 and ${maxFragments} phrases` };
    if (d.body.fragments.some(f => !normalizeMatcherText(f)))
      return { valid: false, error: 'Fragments cannot be empty' };
  }
  if (!d.sender && !d.body) return { valid: false, error: 'At least one condition is required' };
  return { valid: true, definition: d };
}
export function conditionsKeyFor(value: unknown): string {
  const result = validateAccountMatcherDefinition(value);
  if (!result.valid || !result.definition) throw new Error(result.error);
  const d = result.definition;
  return JSON.stringify({
    sender: d.sender ? normalizeMatcherText(d.sender.value) : null,
    body:
      d.body?.kind === 'fragments'
        ? { kind: 'fragments', fragments: d.body.fragments.map(normalizeMatcherText) }
        : d.body?.kind === 'regex'
          ? { kind: 'regex', pattern: d.body.pattern }
          : null,
    // Preserve existing keys byte-for-byte for legacy/Either matchers.
    ...(d.flow ? { flow: d.flow } : {}),
  });
}
