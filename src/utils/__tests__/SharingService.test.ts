import { sharingService, ShareFormat } from '../../services/SharingService';
import {
  JournalShareProvider,
  ShareableJournalEntry,
} from '../../services/sharing/JournalShareProvider';
import { JournalDisplayType } from '../../types/enums';

// Mock native modules for Jest environment
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn(),
    set: jest.fn(),
    getBoolean: jest.fn(),
    contains: jest.fn(),
    remove: jest.fn(),
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: {
    track: jest.fn(),
    screen: jest.fn(),
    trackFeatureUsage: jest.fn(),
  },
}));

jest.mock('../../utils/preferences', () => ({
  preferences: {
    defaultCurrencyCode: 'USD',
  },
}));

describe('SharingService', () => {
  const mockTransactions: ShareableJournalEntry[] = [
    {
      id: '1',
      date: new Date('2023-01-01').getTime(),
      description: 'Income test',
      amount: 1000,
      currencyCode: 'USD',
      displayType: JournalDisplayType.INCOME,
    },
    {
      id: '2',
      date: new Date('2023-01-02').getTime(),
      description: 'Expense test',
      amount: 500,
      currencyCode: 'USD',
      displayType: JournalDisplayType.EXPENSE,
    },
  ];

  it('can format content through JournalShareProvider', () => {
    const provider = new JournalShareProvider(mockTransactions, { title: 'Test Report' });
    const content = provider.getContent(ShareFormat.TEXT);

    expect(content).toContain('TEST REPORT');
    expect(content).toContain('🟢'); // Income emoji
    expect(content).toContain('🔴'); // Expense emoji
    expect(content).toContain('Income:  $1,000.00');
  });

  it('respects showEmojis: false', () => {
    const provider = new JournalShareProvider(mockTransactions, { showEmojis: false });
    const content = provider.getContent(ShareFormat.TEXT);
    expect(content).not.toContain('🟢');
    expect(content).not.toContain('🔴');
  });

  it('automatically disables emojis for CSV', () => {
    const provider = new JournalShareProvider(mockTransactions, { showEmojis: true });
    const content = provider.getContent(ShareFormat.CSV);
    expect(content).not.toContain('🟢');
  });

  it('escapes CSV content correctly', () => {
    const complexTx: ShareableJournalEntry = {
      id: '3',
      date: Date.now(),
      description: 'Business, "Cool" Corp',
      amount: 50,
      currencyCode: 'USD',
      displayType: JournalDisplayType.EXPENSE,
    };
    const provider = new JournalShareProvider([complexTx]);
    const content = provider.getContent(ShareFormat.CSV);
    expect(content).toContain('"Business, ""Cool"" Corp"');
  });

  it('respects sorting', () => {
    const provider = new JournalShareProvider(mockTransactions, { sort: 'asc' });
    const content = provider.getContent(ShareFormat.TEXT);
    const pos1 = content.indexOf('Income test');
    const pos2 = content.indexOf('Expense test');
    expect(pos1).toBeLessThan(pos2); // 2023-01-01 < 2023-01-02
  });

  it('escapes pipes in markdown description', () => {
    const pipeTx: ShareableJournalEntry = {
      id: '4',
      date: Date.now(),
      description: 'Pipe | Test',
      amount: 10,
      currencyCode: 'USD',
      displayType: JournalDisplayType.EXPENSE,
    };
    const provider = new JournalShareProvider([pipeTx]);
    const content = provider.getContent(ShareFormat.MARKDOWN);
    expect(content).toContain('Pipe \\| Test');
  });

  it('normalizes line endings to Windows-compatible \\r\\n', () => {
    const provider = new JournalShareProvider(mockTransactions);
    const content = provider.getContent(ShareFormat.TEXT);
    expect(content).toContain('\r\n');
    expect(content).not.toMatch(/[^\r]\n/); // No lone \n
  });

  it('protects against CSV injection', () => {
    const injectionTx: ShareableJournalEntry = {
      id: '5',
      date: Date.now(),
      description: '=SUM(A1:A10)',
      amount: 10,
      currencyCode: 'USD',
      displayType: JournalDisplayType.EXPENSE,
    };
    const provider = new JournalShareProvider([injectionTx]);
    const csvContent = provider.getContent(ShareFormat.CSV);
    const mdContent = provider.getContent(ShareFormat.MARKDOWN);

    expect(csvContent).toContain("'=SUM(A1:A10)");
    expect(mdContent).toContain("'=SUM(A1:A10)");
  });

  it('escapes backticks and newlines in markdown', () => {
    const complexMdTx: ShareableJournalEntry = {
      id: '6',
      date: Date.now(),
      description: 'Backtick ` test\nNewline test',
      amount: 10,
      currencyCode: 'USD',
      displayType: JournalDisplayType.EXPENSE,
    };
    const provider = new JournalShareProvider([complexMdTx]);
    const content = provider.getContent(ShareFormat.MARKDOWN);

    expect(content).toContain('Backtick \\` test');
    expect(content).toContain('Newline test'); // Newline removed
    expect(content).not.toContain('\nNewline');
  });

  it('groups summaries by mixed currencies correctly', () => {
    const mixedCurrencies: ShareableJournalEntry[] = [
      {
        id: '1',
        date: Date.now(),
        description: 'item1',
        amount: 100,
        currencyCode: 'USD',
        displayType: JournalDisplayType.INCOME,
      },
      {
        id: '2',
        date: Date.now(),
        description: 'item2',
        amount: 50,
        currencyCode: 'EUR',
        displayType: JournalDisplayType.EXPENSE,
      },
    ];
    const provider = new JournalShareProvider(mixedCurrencies);
    const content = provider.getContent(ShareFormat.TEXT);

    expect(content).toContain('Multiple currencies detected');
    expect(content).toContain('[USD]');
    expect(content).toContain('Income:  $100.00');
    expect(content).toContain('[EUR]');
    expect(content).toContain('Expense: €50.00');
  });

  it('uses a stable base filename by default', () => {
    const provider1 = new JournalShareProvider(mockTransactions);
    const provider2 = new JournalShareProvider(mockTransactions);
    expect(provider1.filename).toBe(provider2.filename);
    expect(provider1.filename).toBe('journal-report');
  });

  it('is defined', () => {
    expect(sharingService).toBeDefined();
  });

  it('throws error when sharing empty content', async () => {
    const emptyProvider = {
      id: 'empty',
      title: 'Empty',
      filename: 'empty',
      getContent: () => '',
    };
    await expect(sharingService.share(emptyProvider as any)).rejects.toThrow('Nothing to share');
  });
});
