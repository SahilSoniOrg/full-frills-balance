import { balanceSign } from '@/src/domain/accounting/BalanceEffects';
import { AccountType, TransactionType } from '@/src/types/enums';

/** SQL representation of accounting signs, kept at the persistence boundary. */
export function periodFlowSQL(): { increaseCase: string; decreaseCase: string } {
  const buildSignCase = (sign: -1 | 1) => {
    const clauses = Object.values(AccountType).flatMap(accountType =>
      Object.values(TransactionType)
        .filter(transactionType => balanceSign(accountType, transactionType) === sign)
        .map(
          transactionType =>
            `WHEN (a.account_type = '${accountType}' AND t.transaction_type = '${transactionType}') THEN t.amount`,
        ),
    );
    return `CASE\n      ${clauses.join('\n      ')}\n      ELSE 0\n    END`;
  };
  return { increaseCase: buildSignCase(1), decreaseCase: buildSignCase(-1) };
}
