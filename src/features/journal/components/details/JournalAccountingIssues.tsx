import { AppText, Badge } from '@/src/components/core';
import { DetailGroup } from '@/src/components/shared/DetailGroup';
import { DetailRow } from '@/src/components/shared/DetailRow';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, Spacing } from '@/src/constants';
import { Stack } from '@/src/design-system';
import {
  getValuationIssues,
  type JournalBalanceEvaluation,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { fromMinorUnits } from '@/src/utils/money';

export function JournalAccountingIssues({ evaluation }: { evaluation?: JournalBalanceEvaluation }) {
  if (!evaluation || evaluation.isBalanced) return null;
  const strings = AppConfig.strings.journalDetails;
  const valuationIssues = getValuationIssues(evaluation);
  const incomplete = valuationIssues.length > 0;
  const messages = [...new Set(valuationIssues.map(issue => issue.message))];
  return (
    <DetailGroup
      title={strings.accounting}
      testID="journal-accounting-issues"
      separatorInset={Spacing.lg}
      accessory={
        <Badge size="sm" variant="warning">
          {incomplete ? strings.needsReview : strings.unbalanced}
        </Badge>
      }
    >
      {[
        [strings.debits, evaluation.debitTotalMinorUnits],
        [strings.credits, evaluation.creditTotalMinorUnits],
        [strings.difference, Math.abs(evaluation.differenceMinorUnits)],
      ].map(([label, minor]) => (
        <DetailRow
          key={label}
          label={String(label)}
          value={
            incomplete ? (
              <AppText color="warning">{strings.unavailable}</AppText>
            ) : (
              <MoneyText
                amount={fromMinorUnits(Number(minor), evaluation.journalPrecision)}
                currencyCode={evaluation.journalCurrency}
                variant="body"
                color={label === strings.difference ? 'warning' : 'text'}
              />
            )
          }
        />
      ))}
      {messages.length > 0 ? (
        <Stack space="xs" paddingHorizontal="lg" paddingVertical="md">
          {messages.map(message => (
            <AppText key={message} variant="caption" color="warning">
              {message}
            </AppText>
          ))}
        </Stack>
      ) : null}
    </DetailGroup>
  );
}
