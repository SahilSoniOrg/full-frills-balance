import { AppText, FloatingActionButton, IconButton } from '@/src/components/core'
import { Screen } from '@/src/components/layout'
import { Spacing } from '@/src/constants'
import { AppNavigation } from '@/src/utils/navigation'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { BudgetListView } from '../components/BudgetListView'

export default function BudgetListScreen() {
    return (
        <Screen showBack={true} title="Budgets">
            <View style={styles.header}>
                <View style={styles.summaryRow}>
                    <AppText variant="title" weight="bold">Budgets</AppText>
                    <IconButton
                        name="add"
                        size={24}
                        variant="surface"
                        onPress={() => AppNavigation.toBudgetForm()}
                    />
                </View>
            </View>
            <BudgetListView onAddPress={() => AppNavigation.toBudgetForm()} />
            <FloatingActionButton onPress={() => AppNavigation.toBudgetForm()} />
        </Screen>
    )
}

const styles = StyleSheet.create({
    header: {
        paddingTop: Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
})
