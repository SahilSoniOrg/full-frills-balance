import type {
  AccountMatcherDefinitionV1,
  AccountMatcherSnapshot,
} from '@/src/types/accountMatcher';
import { parseStoredMatcherDefinition } from '@/src/services/sms/recognition/accountMatcherDefinition';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';

/** Compact list presentation; the editor retains the full matching conditions. */
export function accountMatcherPresentation(definition: AccountMatcherDefinitionV1 | null) {
  if (!definition) return { title: copy.invalidMatcherWarning, detail: '' };
  const detail =
    definition.body?.kind === 'regex'
      ? `/${definition.body.pattern}/`
      : definition.body?.kind === 'fragments'
        ? definition.body.fragments.join(' … ')
        : copy.senderOnly;
  return { title: definition.sender?.value || copy.anySender, detail };
}

export function storedAccountMatcherPresentation(
  matcher: Pick<AccountMatcherSnapshot, 'definitionJson'>,
) {
  const definition = parseStoredMatcherDefinition(matcher.definitionJson);
  return { ...accountMatcherPresentation(definition), definition };
}
