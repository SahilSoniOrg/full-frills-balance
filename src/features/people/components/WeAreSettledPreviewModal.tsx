import {
  AppButton,
  AppText,
  Badge,
  Icon,
  IconTile,
  ListGroup,
  ListRow,
} from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Box, Inline, Stack } from '@/src/design-system';
import type { PersonBalanceSummary } from '@/src/domain/people/personTypes';
import { View } from 'react-native';

type Props = {
  visible: boolean;
  personName: string;
  summary: PersonBalanceSummary;
  workplaceCurrency: string;
  closingResidual: number;
  forgivenAccountName: string;
  forgivenAccountType: 'Expense' | 'Income';
  blockedReason?: string;
  formatAmount?: (amount: number, currencyCode: string) => string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function WeAreSettledPreviewModal({
  visible,
  personName,
  summary,
  workplaceCurrency,
  closingResidual,
  forgivenAccountName,
  forgivenAccountType,
  blockedReason,
  formatAmount = (amount, currency) => `${currency} ${amount.toFixed(2)}`,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <ModalSurface
      visible={visible}
      title={`Settle with ${personName}`}
      onClose={onCancel}
      position="bottomSheet"
      fixedHeight={false}
      footer={
        <Inline gap="sm" alignItems="center">
          <Box flex={1}>
            <AppButton variant="outline" onPress={onCancel}>
              Cancel
            </AppButton>
          </Box>
          <Box flex={1}>
            <AppButton variant="primary" onPress={onConfirm} disabled={Boolean(blockedReason)}>
              Confirm
            </AppButton>
          </Box>
        </Inline>
      }
    >
      <Stack gap="lg">
        {summary.currencies.length > 0 ? (
          <ListGroup header="OPEN BALANCES BY CURRENCY">
            {summary.currencies.map(b => (
              <ListRow
                key={b.currencyCode}
                leading={<IconTile icon={Icon.Bank} tint="primary" />}
                title={`${b.currencyCode} Net: ${formatAmount(b.net, b.currencyCode)}`}
                subtitle={`${personName} owes you: ${formatAmount(b.owedToYou, b.currencyCode)} · You owe ${personName}: ${formatAmount(b.youOwe, b.currencyCode)}`}
                wrap
              />
            ))}
          </ListGroup>
        ) : null}

        {summary.convertedNet?.isInformational ? (
          <Inline gap="xs" alignItems="center">
            <Badge size="sm">
              Est. net ~
              {formatAmount(summary.convertedNet.amount, summary.convertedNet.currencyCode)}{' '}
              (informational)
            </Badge>
          </Inline>
        ) : null}

        <ListGroup header="CLOSING ADJUSTMENT">
          <ListRow
            leading={
              <IconTile
                icon={forgivenAccountType === 'Income' ? Icon.ArrowUp : Icon.ArrowDown}
                tint={forgivenAccountType === 'Income' ? 'income' : 'expense'}
              />
            }
            title={`Closing residual (${workplaceCurrency})`}
            subtitle={`${formatAmount(closingResidual, workplaceCurrency)} forgiven to ${forgivenAccountName} (${forgivenAccountType})`}
            wrap
          />
        </ListGroup>

        {blockedReason ? (
          <View accessibilityRole="alert">
            <Badge variant="warning" size="md">
              Negative unassigned remainder: {blockedReason}
            </Badge>
          </View>
        ) : (
          <AppText variant="caption" color="secondary">
            Zeroes open receivable/payable items in your ledger and writes off any rounding or
            forgiven balance to {forgivenAccountName}.
          </AppText>
        )}
      </Stack>
    </ModalSurface>
  );
}
