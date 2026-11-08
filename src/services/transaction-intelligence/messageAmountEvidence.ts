import { extractMessageEconomicEvidence } from '@/src/domain/transaction-intelligence/messageEconomicEvidence';
import { SmsExtractor } from '@/src/services/ledger/SmsExtractor';
import { SMS_CURRENCY_SYMBOLS_PATTERN } from '@/src/utils/sms/smsCurrencyPattern';

interface MessageForAmount {
  id: string;
  receivedAt: number;
  text: string;
  channel: 'sms' | 'email';
}

interface MonetaryAmount {
  amount: number;
  currencyCode: string;
}

const extractor = new SmsExtractor();
const MAX_MENTIONS = 32;
const MAX_FRAGMENTS = 256;

/** A currency may be omitted next to the movement even when another amount has one. */
async function movementAmounts(
  message: MessageForAmount,
  text: string,
  currencyCode: string,
): Promise<number[] | null> {
  const expressions = [
    /(?:^|[^A-Za-z0-9])(\d[\d,.]*)\s+(?:spent|paid|purchase(?:d)?|debited|credited|transferred)\b/gi,
    /\b(?:spent|paid|purchase(?:d)?|debited|credited|transferred)(?:\s+(?:of|by|with))?\s*[:=-]?\s*(\d[\d,.]*)\b/gi,
  ];
  let count = 0;
  const amounts = new Set<number>();
  for (const expression of expressions) {
    for (const match of text.matchAll(expression)) {
      if (++count > MAX_MENTIONS) return null;
      const info = await extractor.extract({
        channel: message.channel,
        id: message.id,
        date: message.receivedAt,
        rawText: `${currencyCode} ${match[1]}`,
      });
      if (!info.amount || !Number.isFinite(info.amount)) return null;
      amounts.add(info.amount);
    }
  }
  return [...amounts];
}

/** Find explicit currency/amount pairs; account numbers and reference IDs are not amounts. */
async function monetaryAmounts(
  message: MessageForAmount,
  text: string,
): Promise<MonetaryAmount[] | null> {
  const expressions = [
    new RegExp(`(?:^|[^A-Za-z0-9])(${SMS_CURRENCY_SYMBOLS_PATTERN})\\s*(\\d[\\d,.]*)`, 'gi'),
    new RegExp(
      `(?:^|[^A-Za-z0-9])(\\d[\\d,.]*)\\s*(${SMS_CURRENCY_SYMBOLS_PATTERN})(?![A-Za-z0-9])`,
      'gi',
    ),
  ];
  const amounts = new Map<string, MonetaryAmount>();
  let count = 0;
  for (const expression of expressions) {
    for (const match of text.matchAll(expression)) {
      if (++count > MAX_MENTIONS) return null;
      const info = await extractor.extract({
        channel: message.channel,
        id: message.id,
        date: message.receivedAt,
        rawText: `${match[1]} ${match[2]}`,
      });
      if (!info.amount || !info.currencyCode || !Number.isFinite(info.amount)) return null;
      amounts.set(`${info.currencyCode}:${info.amount}`, {
        amount: info.amount,
        currencyCode: info.currencyCode,
      });
    }
  }
  return [...amounts.values()];
}

/** Resolve balances and other amounts only when the transaction statement identifies one value. */
export async function resolveMessageTransactionAmount(
  message: MessageForAmount,
  original: { amount?: number; currencyCode?: string },
): Promise<{ amount?: number; currencyCode?: string; reliable: boolean }> {
  const all = await monetaryAmounts(message, message.text);
  if (!all?.length) return { ...original, reliable: false };
  if (all.length === 1) {
    const value = all[0];
    const movements = await movementAmounts(message, message.text, value.currencyCode);
    return {
      ...original,
      reliable:
        original.amount === value.amount &&
        original.currencyCode === value.currencyCode &&
        !!movements &&
        movements.every(amount => amount === value.amount),
    };
  }

  // A separately labeled balance in the same sentence need not block capture.
  // Other extra amounts (for example fees) remain ambiguous here.
  const currencies = new Set(all.map(value => value.currencyCode));
  if (currencies.size === 1) {
    const movements = await movementAmounts(message, message.text, all[0].currencyCode);
    if (movements?.length === 1) {
      const matched = all.find(value => value.amount === movements[0]);
      const balancePattern = new RegExp(
        `\\b(?:(?:avl|avbl|available|current|remaining|closing|ledger|account)\\s+)?(?:bal|balance)\\b\\s*(?:is|of|:|=|-)?\\s*(?:${SMS_CURRENCY_SYMBOLS_PATTERN})\\s*\\d[\\d,.]*`,
        'gi',
      );
      const withoutBalances = message.text.replace(balancePattern, ' ');
      const remaining = await monetaryAmounts(message, withoutBalances);
      if (
        matched &&
        remaining?.length === 1 &&
        remaining[0].amount === matched.amount &&
        remaining[0].currencyCode === matched.currencyCode
      )
        return { ...matched, reliable: true };
    }
  }

  const evidence = extractMessageEconomicEvidence(message.text);
  if (evidence !== 'purchase' && evidence !== 'salary' && evidence !== 'transfer')
    return { ...original, reliable: false };
  const fragments = message.text.split(/\r?\n|;|[.!?]\s+(?=[A-Z])/);
  if (fragments.length > MAX_FRAGMENTS) return { ...original, reliable: false };
  const eventFragments = fragments.filter(
    fragment => extractMessageEconomicEvidence(fragment) === evidence,
  );
  if (eventFragments.length !== 1) return { ...original, reliable: false };
  const eventAmounts = await monetaryAmounts(message, eventFragments[0]);
  const eventMovements =
    eventAmounts?.length === 1
      ? await movementAmounts(message, eventFragments[0], eventAmounts[0].currencyCode)
      : null;
  if (
    eventAmounts?.length !== 1 ||
    !eventMovements ||
    eventMovements.some(amount => amount !== eventAmounts[0].amount)
  )
    return { ...original, reliable: false };
  return { ...eventAmounts[0], reliable: true };
}
