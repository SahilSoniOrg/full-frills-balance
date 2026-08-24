import Account from '@/src/data/models/Account';
import { AuditAction, AccountSubtype, AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { SerializedAccountMetadataPayload } from '@/src/types/plainDtos';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { analytics } from '@/src/services/analytics';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import {
  assertParentHasNoTransactions,
  assertParentMatchesChildType,
  journalLegTypesForSignedAmount,
  resolveAccountSubtype,
  shouldPostInitialBalance,
} from '@/src/services/accounts/accountRules';
import {
  findAccountByName,
  getOpeningBalancesAccountInput,
} from '@/src/services/accounts/accountSystemAccounts';
import { ledgerWriteService } from '@/src/services/ledger/ledgerWriteService';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { workplaceService } from '@/src/services/WorkplaceService';
import { IconName } from '@/src/types/domainIcons';
import { roundToPrecision } from '@/src/utils/money';
import { isValidHexColor } from '@/src/utils/accountCategory';

/** Caller-owned fields for creating an account (form / onboarding data only). */
export interface CreateAccountCommandInput {
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
  description?: string;
  icon?: IconName;
  /** Custom accent color (hex). Empty/omitted = derive from account type. */
  color?: string;
  initialBalance?: number;
  /** @deprecated Ordinary creation always appends within its sibling list. */
  orderNum?: number;
  parentAccountId?: AccountId | null;
  workplaceId: WorkplaceId;
  metadata?: Partial<SerializedAccountMetadataPayload>;
}

/** @deprecated Use CreateAccountCommandInput; kept for existing service typings. */
export type CreateAccountData = CreateAccountCommandInput;

export async function createAccount(
  workplaceId: WorkplaceId,
  input: CreateAccountCommandInput,
): Promise<Account> {
  let currencyCode = input.currencyCode;
  if (!currencyCode) {
    currencyCode = await workplaceService.getCurrency(workplaceId);
  }

  if (input.parentAccountId) {
    const [parent] = await assertWritable(workplaceId, [input.parentAccountId], 'Parent account');
    assertParentMatchesChildType(input.accountType, parent);
    const hasTransactions = await transactionQueryRepository.hasTransactions(
      workplaceId,
      input.parentAccountId,
    );
    if (hasTransactions) {
      assertParentHasNoTransactions(parent.name);
    }
  }

  if (input.metadata?.payFromAccountId) {
    await assertWritable(
      workplaceId,
      [input.metadata.payFromAccountId],
      'Account metadata pay-from',
    );
  }

  const precision = await currencyReadService.getPrecision(currencyCode);
  const postOpening = shouldPostInitialBalance(input.initialBalance, precision);
  const payload = {
    name: input.name,
    accountType: input.accountType,
    accountSubtype: resolveAccountSubtype(input.accountType, input.accountSubtype),
    currencyCode,
    description: input.description,
    icon: input.icon,
    color: input.color && isValidHexColor(input.color) ? input.color : undefined,
    orderNum: 0,
    parentAccountId: input.parentAccountId || undefined,
    workplaceId: input.workplaceId,
    metadata: input.metadata,
  };

  let existingOpeningId: AccountId | undefined;
  let companionPayloads: ReturnType<typeof getOpeningBalancesAccountInput>[] | undefined;
  if (postOpening) {
    const openingInput = getOpeningBalancesAccountInput(currencyCode, input.workplaceId);
    const existingOpening = await findAccountByName(workplaceId, openingInput.name);
    if (existingOpening) {
      existingOpeningId = existingOpening.id;
    } else {
      companionPayloads = [openingInput];
    }
  }

  const journalDate = Date.now();
  let accountsToRebuild: Set<AccountId> | undefined;

  const account = await accountWriteRepository.persistCreatedAccount({
    payload,
    resolvePayload: accounts => ({
      ...payload,
      orderNum: accounts.filter(
        candidate =>
          (candidate.parentAccountId || undefined) === (input.parentAccountId || undefined) &&
          candidate.accountType === input.accountType,
      ).length,
    }),
    companionPayloads,
    extraOps: ({ account: created }) => [
      auditRepository.prepareLog(
        {
          entityType: 'account',
          entityId: created.id,
          action: AuditAction.CREATE,
          changes: {
            after: {
              name: created.name,
              accountType: created.accountType,
              accountSubtype: created.accountSubtype,
              currencyCode: created.currencyCode,
              description: created.description,
              icon: created.icon,
              color: created.color,
              orderNum: created.orderNum,
              parentAccountId: created.parentAccountId,
              initialBalance: input.initialBalance,
            },
          },
        },
        workplaceId,
      ),
    ],
    followUpBatch: postOpening
      ? async ({ account: created, companions }) => {
          const roundedAmount = roundToPrecision(Math.abs(input.initialBalance!), precision);
          const balancingAccountId = existingOpeningId ?? companions[0]?.id;
          if (!balancingAccountId) {
            throw new Error('Opening balances account missing');
          }
          const { accountTxType, balancingTxType } = journalLegTypesForSignedAmount(
            input.accountType,
            input.initialBalance!,
          );
          const prepared = await ledgerWriteService.prepareCreateJournal(
            {
              journalDate,
              description: `Initial Balance: ${input.name}`,
              currencyCode,
              transactions: [
                {
                  accountId: created.id,
                  amount: roundedAmount,
                  transactionType: accountTxType,
                },
                {
                  accountId: balancingAccountId,
                  amount: roundedAmount,
                  transactionType: balancingTxType,
                },
              ],
            },
            input.workplaceId,
          );
          accountsToRebuild = prepared.accountsToRebuild;
          return prepared.ops;
        }
      : undefined,
    afterBatch: () => {
      if (accountsToRebuild && accountsToRebuild.size > 0) {
        rebuildQueueService.enqueueMany(accountsToRebuild, journalDate, workplaceId);
      }
    },
  });

  analytics.logAccountCreated(account.accountType, account.currencyCode);

  return account;
}
