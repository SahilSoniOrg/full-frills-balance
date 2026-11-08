import { parseGmailTransaction } from '../parseGmailTransaction';
import type { GmailObservation } from '../gmailApi';

function message(text: string): GmailObservation {
  return {
    id: 'message',
    receivedAt: Date.UTC(2026, 10, 6),
    sender: 'alerts@bank.example',
    subject: 'Transaction alert',
    text,
  };
}

it('retains a single explicitly denominated purchase amount', async () => {
  const result = await parseGmailTransaction(
    message('INR 450 spent on Card XX1234 at MARKET. Ref 1234567890.'),
  );
  expect(result).toMatchObject({
    amount: 450,
    currencyCode: 'INR',
    amountReliableForCapture: true,
  });
});

it('selects the purchase amount when a separate balance precedes it', async () => {
  const result = await parseGmailTransaction(
    message('Amount INR 1500.\nINR 450 spent on Card XX1234 at MARKET. Ref 1234567890.'),
  );
  expect(result).toMatchObject({
    amount: 450,
    currencyCode: 'INR',
    amountReliableForCapture: true,
  });
});

it('requires review if the transaction statement contains conflicting amounts', async () => {
  const result = await parseGmailTransaction(
    message('INR 450 spent on Card XX1234 at MARKET including INR 50 fee. Ref 1234567890.'),
  );
  expect(result?.amountReliableForCapture).toBe(false);
});

it('does not use the balance when the movement amount has no currency beside it', async () => {
  const result = await parseGmailTransaction(
    message('Amount INR 1500.\n450 spent on Card XX1234 at MARKET. Ref 1234567890.'),
  );
  expect(result?.amountReliableForCapture).toBe(false);
});

it('requires review when multiple purchase statements have different amounts', async () => {
  const result = await parseGmailTransaction(
    message(
      'INR 450 spent on Card XX1234 at MARKET.\nINR 900 spent on Card XX1234 at STORE. Ref 1234567890.',
    ),
  );
  expect(result?.amountReliableForCapture).toBe(false);
});
