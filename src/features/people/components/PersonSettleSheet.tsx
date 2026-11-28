import { Icon, ListGroup, ListRow } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';

type Props = {
  visible: boolean;
  personName: string;
  /** True when this person has open receivable (they owe you). */
  hasReceivable?: boolean;
  /** True when this person has open payable (you owe them). */
  hasPayable?: boolean;
  onClose: () => void;
  onMoneyReceived: () => void;
  onClearOpenBalances: () => void;
};

function clearSubtitle(personName: string, hasReceivable: boolean, hasPayable: boolean) {
  if (hasReceivable && hasPayable) {
    return `Zero both sides — receivable and payable. Equal amounts cancel; any leftover is written off. The app never does this unless you choose it.`;
  }
  if (hasReceivable) {
    return `Zero what ${personName} owes you. Any amount you don't record as a payment is written off.`;
  }
  if (hasPayable) {
    return `Zero what you owe ${personName}. Any amount you don't record as a payment is written off.`;
  }
  return `Zero open receivable and payable for ${personName}.`;
}

export function PersonSettleSheet({
  visible,
  personName,
  hasReceivable = false,
  hasPayable = false,
  onClose,
  onMoneyReceived,
  onClearOpenBalances,
}: Props) {
  const afterDismiss = useAfterDismiss();

  const close = () => {
    afterDismiss.cancel();
    onClose();
  };

  const run = (action: () => void) => {
    afterDismiss.run(action);
    onClose();
  };

  return (
    <ModalSurface
      visible={visible}
      title={`Settle with ${personName}`}
      onClose={close}
      onDismiss={afterDismiss.onDismiss}
      position="bottomSheet"
      fixedHeight={false}
      contentTestID="person-settle-sheet"
    >
      <ListGroup variant="plain" dividerInset="none">
        <ListRow
          title="Record payment"
          subtitle={`Cash or bank moved — ${personName} paid you, or you paid them`}
          icon={Icon.Wallet}
          chevron
          wrap
          accessibilityRole="button"
          testID="person-settle-money-received"
          onPress={() => run(onMoneyReceived)}
        />
        <ListRow
          title="Clear open balances"
          subtitle={clearSubtitle(personName, hasReceivable, hasPayable)}
          icon={Icon.CheckCircle}
          chevron
          wrap
          accessibilityRole="button"
          testID="person-settle-clear-balances"
          onPress={() => run(onClearOpenBalances)}
        />
      </ListGroup>
    </ModalSurface>
  );
}
