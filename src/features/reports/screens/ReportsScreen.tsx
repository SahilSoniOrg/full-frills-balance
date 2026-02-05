import { ReportsView } from '@/src/features/reports/components/ReportsView';
import { useReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import React from 'react';

export default function ReportsScreen() {
    const vm = useReportsViewModel();
    return <ReportsView {...vm} />;
}
