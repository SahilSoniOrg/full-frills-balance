import { SmsMessage } from '@/modules/expo-sms-inbox';

export type SmsFixtureKey =
  | 'upiRef121554846690'
  | 'swiggyNoRef'
  | 'swiggyRepeatDay2'
  | 'cardEndingNegative'
  | 'parseFailedNoAmount'
  | 'personalSender';

export interface SmsFixture {
  key: SmsFixtureKey;
  body: string;
  expectedRef: string | null;
  sender?: string;
}

export const SMS_FIXTURES: Record<SmsFixtureKey, SmsFixture> = {
  upiRef121554846690: {
    key: 'upiRef121554846690',
    body: 'INR 250.00 debited (UPI Ref No 121554846690) on 07-Mar.',
    expectedRef: '121554846690',
  },
  swiggyNoRef: {
    key: 'swiggyNoRef',
    body: 'Rs.500 debited at SWIGGY on 07-Mar. Avbl bal Rs.5000',
    expectedRef: null,
  },
  swiggyRepeatDay2: {
    key: 'swiggyRepeatDay2',
    body: 'Rs.500 debited at SWIGGY on 08-Mar. Avbl bal Rs.4500',
    expectedRef: null,
  },
  cardEndingNegative: {
    key: 'cardEndingNegative',
    body: 'Rs. 2,499.00 spent on your card ending 4608 at AMAZON on 12-03.',
    expectedRef: null,
  },
  parseFailedNoAmount: {
    key: 'parseFailedNoAmount',
    body: 'HDFCBK: Amount debited from your account at SWIGGY. Check passbook.',
    expectedRef: null,
  },
  personalSender: {
    key: 'personalSender',
    body: 'Hey, can you send me 500?',
    expectedRef: null,
    sender: '+919876543210',
  },
};

export function smsMessageFromFixture(
  fixtureKey: SmsFixtureKey,
  overrides: Partial<SmsMessage> = {},
): SmsMessage {
  const fixture = SMS_FIXTURES[fixtureKey];
  return {
    id: overrides.id ?? `sms-${fixtureKey}`,
    address: overrides.address ?? fixture.sender ?? 'HDFCBK',
    body: overrides.body ?? fixture.body,
    date: overrides.date ?? 1_700_000_000_000,
    ...overrides,
  };
}
