import { generator } from '@/src/utils/idGenerator';
import { Database as WatermelonDB } from '@nozbe/watermelondb';
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';

import DeviceSmsInboxRecord from '@/src/data/models/DeviceSmsInboxRecord';

// Models
import Account from '@/src/data/models/Account';
import AccountMatcher from '@/src/data/models/AccountMatcher';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import AuditLog from '@/src/data/models/AuditLog';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import BalanceRebuildIntent from '@/src/data/models/BalanceRebuildIntent';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import Currency from '@/src/data/models/Currency';
import ExchangeRate from '@/src/data/models/ExchangeRate';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import Transaction from '@/src/data/models/Transaction';
import Workplace from '@/src/data/models/Workplace';
import Person from '@/src/data/models/Person';
import PersonAccount from '@/src/data/models/PersonAccount';
import OpenItem from '@/src/data/models/OpenItem';
import SettlementAllocation from '@/src/data/models/SettlementAllocation';

// Adapter (platform-specific resolution handled by Metro)
import adapter from '@/src/data/database/adapter';

// Use Native Crypto for IDs (58x faster) if available
if (generator) {
  setGenerator(generator);
}

export const database = new WatermelonDB({
  adapter,
  modelClasses: [
    DeviceSmsInboxRecord,
    Account,
    AccountMatcher,
    AccountMetadata,
    AuditLog,
    BalanceSnapshot,
    BalanceRebuildIntent,
    Budget,
    BudgetScope,
    Currency,
    ExchangeRate,
    Journal,
    JournalMetadata,
    PlannedPayment,
    TransactionInboxRecord,
    Transaction,
    Workplace,
    Person,
    PersonAccount,
    OpenItem,
    SettlementAllocation,
  ],
});
