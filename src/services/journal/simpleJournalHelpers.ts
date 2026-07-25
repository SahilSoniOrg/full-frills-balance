import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import {
  AccountId,
  AccountRole,
  EMPTY_ACCOUNT_ID,
  JournalEntryLine,
  TabType,
} from '@/src/types/domain';

export function deriveCrossCurrencyDisplayRate(
  sourceToBaseRate: number,
  destToBaseRate: number,
): number {
  return sourceToBaseRate / destToBaseRate;
}

export interface ResolveSimpleCrossCurrencyRatesInput {
  sourceCurrency: string;
  destCurrency: string;
  workplaceCurrency: string;
  fetchedSourceToWorkplace: number;
  fetchedDestToWorkplace: number;
}

/** Derives simple-form cross-currency base and display rates after workplace-relative fetches. */
export function resolveSimpleCrossCurrencyRates(input: ResolveSimpleCrossCurrencyRatesInput): {
  sourceBaseRate: number;
  destBaseRate: number;
  exchangeRate: number;
} {
  const {
    sourceCurrency,
    destCurrency,
    workplaceCurrency,
    fetchedSourceToWorkplace,
    fetchedDestToWorkplace,
  } = input;

  const sourceBaseRate = sourceCurrency !== workplaceCurrency ? fetchedSourceToWorkplace : 1.0;
  const destBaseRate = destCurrency !== workplaceCurrency ? fetchedDestToWorkplace : 1.0;

  return {
    sourceBaseRate,
    destBaseRate,
    exchangeRate: deriveCrossCurrencyDisplayRate(sourceBaseRate, destBaseRate),
  };
}

export function computeSimpleConvertedAmount(
  numAmount: number,
  isCrossCurrency: boolean,
  exchangeRate: number | null,
): number {
  if (!isCrossCurrency || !exchangeRate) return numAmount;
  return numAmount * exchangeRate;
}

export function parseSimpleAmountInput(amount: string): number {
  return parseFloat(amount.replace(/[^0-9.]/g, '')) || 0;
}

export interface SimpleCrossCurrencySyncInput {
  isCrossCurrency: boolean;
  exchangeRate: number | null;
  sourceBaseRate: number | null;
  destBaseRate: number | null;
  sourceCurrency?: string;
  destCurrency?: string;
  baseCurrency: string;
  amount: string;
  convertedAmount: number;
  sourceLine: Pick<JournalEntryLine, 'id' | 'exchangeRate' | 'amount'>;
  destinationLine: Pick<JournalEntryLine, 'id' | 'exchangeRate' | 'amount'>;
}

/** Builds line patch map for simple-mode cross-currency amount/rate sync. */
export function buildSimpleCrossCurrencyLineUpdates(
  input: SimpleCrossCurrencySyncInput,
): Record<string, Partial<JournalEntryLine>> {
  const {
    isCrossCurrency,
    exchangeRate,
    sourceBaseRate,
    destBaseRate,
    sourceCurrency,
    destCurrency,
    baseCurrency,
    amount,
    convertedAmount,
    sourceLine,
    destinationLine,
  } = input;

  const updates: Record<string, Partial<JournalEntryLine>> = {};

  if (isCrossCurrency && exchangeRate) {
    const formattedConverted = convertedAmount.toFixed(2);

    if (sourceCurrency !== baseCurrency && sourceBaseRate) {
      const srcRateStr = sourceBaseRate.toFixed(6);
      if (sourceLine.exchangeRate !== srcRateStr) {
        updates[sourceLine.id] = { exchangeRate: srcRateStr };
      }
    } else if (sourceLine.exchangeRate) {
      updates[sourceLine.id] = { exchangeRate: '' };
    }

    if (destCurrency !== baseCurrency && destBaseRate) {
      const dstRateStr = destBaseRate.toFixed(6);
      if (destinationLine.exchangeRate !== dstRateStr) {
        updates[destinationLine.id] = { exchangeRate: dstRateStr };
      }
    } else if (destinationLine.exchangeRate) {
      updates[destinationLine.id] = { exchangeRate: '' };
    }

    if (destinationLine.amount !== formattedConverted) {
      updates[destinationLine.id] = {
        ...updates[destinationLine.id],
        amount: formattedConverted,
      };
    }
  } else if (!isCrossCurrency) {
    if (sourceLine.exchangeRate) updates[sourceLine.id] = { exchangeRate: '' };
    if (destinationLine.exchangeRate) updates[destinationLine.id] = { exchangeRate: '' };
    if (destinationLine.amount !== amount) {
      updates[destinationLine.id] = {
        ...updates[destinationLine.id],
        amount,
      };
    }
  }

  return updates;
}

export interface SimpleFormSectionConfig {
  title: string;
  accounts: Account[];
  selectedId: AccountId;
  role: AccountRole;
}

export function buildSimpleFormAccountSections(
  type: TabType,
  options: {
    expenseAccounts: Account[];
    incomeAccounts: Account[];
    transactionAccounts: Account[];
    leafAccounts: Account[];
    sourceId: AccountId;
    destinationId: AccountId;
  },
): SimpleFormSectionConfig[] {
  const {
    expenseAccounts,
    incomeAccounts,
    transactionAccounts,
    leafAccounts,
    sourceId,
    destinationId,
  } = options;

  if (type === 'expense') {
    return [
      {
        title: AppConfig.strings.transactionFlow.simpleEntry.toCategory,
        accounts: expenseAccounts,
        selectedId: destinationId,
        role: 'destination',
      },
      {
        title: AppConfig.strings.transactionFlow.simpleEntry.fromAccount,
        accounts: transactionAccounts,
        selectedId: sourceId,
        role: 'source',
      },
    ];
  }

  if (type === 'income') {
    return [
      {
        title: AppConfig.strings.transactionFlow.simpleEntry.fromSource,
        accounts: incomeAccounts,
        selectedId: sourceId,
        role: 'source',
      },
      {
        title: AppConfig.strings.transactionFlow.simpleEntry.toAccount,
        accounts: transactionAccounts,
        selectedId: destinationId,
        role: 'destination',
      },
    ];
  }

  return [
    {
      title: AppConfig.strings.transactionFlow.simpleEntry.sourceAccount,
      accounts: leafAccounts,
      selectedId: sourceId,
      role: 'source',
    },
    {
      title: AppConfig.strings.transactionFlow.simpleEntry.destinationAccount,
      accounts: leafAccounts,
      selectedId: destinationId,
      role: 'destination',
    },
  ];
}

export function buildSimpleDefaultDescription(
  type: TabType,
  sourceAccount: Account | undefined,
  destAccount: Account | undefined,
): string {
  if (type === 'expense' && destAccount) {
    return AppConfig.strings.transactionFlow.simpleEntry.defaultDescriptions.expense(
      destAccount.name,
    );
  }
  if (type === 'income' && sourceAccount) {
    return AppConfig.strings.transactionFlow.simpleEntry.defaultDescriptions.income(
      sourceAccount.name,
    );
  }
  return AppConfig.strings.transactionFlow.simpleEntry.defaultDescriptions.transfer;
}

/** Whether a remembered account id applies as default for the given simple tab and leg. */
export function shouldApplyLastUsedAccountDefault(
  type: TabType,
  role: 'source' | 'destination',
  currentId: AccountId,
): boolean {
  if (currentId && currentId !== EMPTY_ACCOUNT_ID) return false;
  if (role === 'source') {
    return type === 'transfer' || type === 'expense';
  }
  return type === 'transfer' || type === 'income';
}
