import { AccountDetailsView } from '@/src/features/accounts/components/AccountDetailsView';
import { useAccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import React from 'react';

export default function AccountDetailsScreen() {
    const vm = useAccountDetailsViewModel();
    return <AccountDetailsView {...vm} />;
}
