import fs from 'fs';
import path from 'path';

describe('TransactionRawRepository transaction count pruning', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'TransactionRawRepository.ts'), 'utf8');

  const countMethod = source.slice(
    source.indexOf('async getAccountTransactionCountsRaw'),
    source.indexOf('async getTransactionsMetadataRaw'),
  );

  it('prunes counts per-account via last_date, not a workplace-wide min snapshot date', () => {
    expect(countMethod).toContain('t.transaction_date >= b.last_date');
    expect(countMethod).not.toMatch(/minTransactionDate/);
    // Guard against reintroducing a global lower bound that hides older activity
    // on accounts that lack their own snapshot while another account has one.
    expect(countMethod).not.toMatch(/AND t\.transaction_date >= \?/);
  });
});
