import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants';
import { AppNavigation } from '@/src/utils/navigation';
import React from 'react';
import { PlannedPaymentListView } from '../components/PlannedPaymentListView';

export default function PlannedPaymentListScreen() {
    return (
        <Screen
            title={AppConfig.strings.journal.plannedPayments}
            showBack={true}
        >
            <PlannedPaymentListView onAddPress={() => AppNavigation.toPlannedPaymentForm()} />
            <FloatingActionButton
                onPress={() => AppNavigation.toPlannedPaymentForm()}
                label="New Planned Payment"
                placement="end"
                accessibilityLabel="Create a new planned payment"
            />
        </Screen>
    );
}
