import { SmsInboxView } from '@/src/features/settings/components/SmsInboxView';
import { useSmsInboxViewModel } from '@/src/features/settings/hooks/useSmsInboxViewModel';
import React from 'react';

export default function SmsInboxScreen() {
  const vm = useSmsInboxViewModel();

  return <SmsInboxView vm={vm} />;
}
