import { AccountReorderView } from '@/src/features/accounts/components/AccountReorderView';
import { useAccountReorderViewModel } from '@/src/features/accounts/hooks/useAccountReorderViewModel';
import React from 'react';

export default function AccountReorderScreen() {
    const vm = useAccountReorderViewModel();
    return <AccountReorderView {...vm} />;
}
