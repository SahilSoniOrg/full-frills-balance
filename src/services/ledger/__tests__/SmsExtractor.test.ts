import { SmsExtractor } from '../SmsExtractor';

const extractor = new SmsExtractor();

async function merchant(rawText: string) {
  const result = await extractor.extract({
    channel: 'email',
    id: 'message',
    date: Date.UTC(2026, 10, 6),
    rawText,
  });
  return result.merchantName;
}

it('finds the merchant without matching a preposition inside an earlier word', async () => {
  await expect(
    merchant('Your format NOTICE. INR 450 spent on card at MARKET on 6 November.'),
  ).resolves.toBe('MARKET');
  await expect(merchant('Your auto NOTICE. INR 450 paid to MARKET on 6 November.')).resolves.toBe(
    'MARKET',
  );
  await expect(
    merchant('Your hobby NOTICE. INR 5000 received from EMPLOYER on 6 November.'),
  ).resolves.toBe('EMPLOYER');
});

it('still recognizes symbolic and labelled merchant prefixes', async () => {
  await expect(merchant('INR 450 paid @ MARKET on 6 November.')).resolves.toBe('MARKET');
  await expect(merchant('INR 450 paid info: MARKET on 6 November.')).resolves.toBe('MARKET');
});
