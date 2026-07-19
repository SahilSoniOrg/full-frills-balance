import { generator } from '@/src/data/database/idGenerator';
import { Database as WatermelonDB } from '@nozbe/watermelondb';
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';

// Models
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import AuditLog from '@/src/data/models/AuditLog';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import Currency from '@/src/data/models/Currency';
import DailyCheckIn from '@/src/data/models/DailyCheckIn';
import ExchangeRate from '@/src/data/models/ExchangeRate';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import Transaction from '@/src/data/models/Transaction';
import Workplace from '@/src/data/models/Workplace';

// Adapter (platform-specific resolution handled by Metro)
import adapter from '@/src/data/database/adapter';

// Use Native Crypto for IDs (58x faster)
// Use Native Crypto for IDs (58x faster) if available
if (generator) {
  setGenerator(generator);
}

export const database = new WatermelonDB({
  adapter,
  modelClasses: [
    Account,
    AccountMetadata,
    AuditLog,
    BalanceSnapshot,
    Budget,
    BudgetScope,
    Currency,
    DailyCheckIn,
    ExchangeRate,
    Journal,
    JournalMetadata,
    PlannedPayment,
    TransactionAutoPostRule,
    TransactionInboxRecord,
    Transaction,
    Workplace,
  ],
});
