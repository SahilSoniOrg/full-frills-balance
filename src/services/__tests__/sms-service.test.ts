jest.mock('@/modules/expo-sms-inbox', () => ({
  __esModule: true,
  default: undefined,
}))

jest.mock('@/src/utils/logger')

import { SmsParseStatus } from '@/src/data/models/SmsInboxRecord'
import { smsService } from '@/src/services/sms-service'

describe('smsService.parseTransactionMessage', () => {
  it('parses INR debit messages with merchant and account source', () => {
    const parsed = smsService.parseTransactionMessage({
      id: 'sms-1',
      address: 'HDFCBK',
      body: 'Your card XX1234 is debited by INR 1,299.50 at SWIGGY on 07-03. Ref 12345678',
      date: 1700000000000,
    })

    expect(parsed.parseStatus).toBe(SmsParseStatus.PARSED)
    expect(parsed.type).toBe('debit')
    expect(parsed.amount).toBe(1299.5)
    expect(parsed.currencyCode).toBe('INR')
    expect(parsed.merchant).toBe('SWIGGY')
    expect(parsed.accountSource).toBe('Card 1234')
    expect(parsed.referenceNumber).toBe('12345678')
  })

  it('parses symbol-based foreign currency messages', () => {
    const parsed = smsService.parseTransactionMessage({
      id: 'sms-2',
      address: 'AMEX',
      body: 'Amt $24.99 spent at NETFLIX on your card 9876',
      date: 1700000001000,
    })

    expect(parsed.parseStatus).toBe(SmsParseStatus.PARSED)
    expect(parsed.amount).toBe(24.99)
    expect(parsed.currencyCode).toBe('USD')
    expect(parsed.merchant).toBe('NETFLIX')
    expect(parsed.type).toBe('debit')
  })

  it('marks transaction-like messages without amount as parse failed', () => {
    const parsed = smsService.parseTransactionMessage({
      id: 'sms-3',
      address: 'ICICIB',
      body: 'Your account was debited at AMAZON. Balance available is 5000.',
      date: 1700000002000,
    })

    expect(parsed.parseStatus).toBe(SmsParseStatus.PARSE_FAILED)
    expect(parsed.parseReason).toContain('supported amount')
  })

  it('ignores personal sender messages', () => {
    const parsed = smsService.parseTransactionMessage({
      id: 'sms-4',
      address: '+919999999999',
      body: 'Paid INR 100 to friend',
      date: 1700000003000,
    })

    expect(parsed.parseStatus).toBe(SmsParseStatus.IGNORED)
    expect(parsed.parseReason).toContain('Personal')
  })
})
