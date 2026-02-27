import { PopupModal } from '@/src/components/common/PopupModal';
import { AppText } from '@/src/components/core';
import { InsightWidget } from '@/src/features/dashboard/components/InsightWidget';
import { Pattern } from '@/src/services/insight-service';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface InsightsBottomSheetProps {
    visible: boolean;
    onClose: () => void;
    patterns: Pattern[];
}

export function InsightsBottomSheet({ visible, onClose, patterns }: InsightsBottomSheetProps) {
    return (
        <PopupModal
            visible={visible}
            onClose={onClose}
            title="Insights"
            scrollable={true}
            maxHeightPercent={85}
            actions={[
                { label: 'Close', onPress: onClose, variant: 'secondary' }
            ]}
        >
            {patterns.length > 0 ? (
                <View style={styles.content}>
                    <InsightWidget patterns={patterns} />
                </View>
            ) : (
                <View style={styles.emptyContainer}>
                    <AppText color="secondary" align="center">
                        No active insights at the moment. You're doing great!
                    </AppText>
                </View>
            )}
        </PopupModal>
    );
}

const styles = StyleSheet.create({
    content: {
        marginTop: 8,
    },
    emptyContainer: {
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
    }
});
