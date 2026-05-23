import { TransactionInboxView } from '@/src/features/settings/components/TransactionInboxView';
import { useTransactionInboxViewModel } from '@/src/features/settings/hooks/useTransactionInboxViewModel';
import React from 'react';

export default function TransactionInboxScreen() {
  const vm = useTransactionInboxViewModel();

  return <TransactionInboxView vm={vm} />;
}
