import type { AccountMatcherContext } from '@/src/types/accountMatcher';
import { recognizeSmsAccounts } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import { singleMailboxAddress } from './mailboxAddress';

/** Require a complete exact sender mailbox before applying confirmed message patterns. */
export function recognizeEmailAccounts(
  context: AccountMatcherContext,
  message: { sender: string; text: string },
) {
  const sender = singleMailboxAddress(message.sender);
  const matchers = sender
    ? context.matchers.filter(matcher => {
        const configured = matcher.definition?.sender?.value;
        return !!configured && singleMailboxAddress(configured) === sender;
      })
    : [];
  return recognizeSmsAccounts(
    { ...context, matchers },
    { senderAddress: sender ?? '', rawBody: message.text },
  );
}
