import { AccountFormView } from '@/src/features/accounts/components/AccountFormView';
import { useAccountFormViewModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import React from 'react';

export default function AccountCreationScreen() {
    const vm = useAccountFormViewModel();
    return <AccountFormView {...vm} />;
}
