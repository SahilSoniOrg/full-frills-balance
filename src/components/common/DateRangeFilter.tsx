import { DateRange } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { DateRangeTrigger } from './DateRangeTrigger';

interface DateRangeFilterProps {
    range: DateRange | null;
    onPress: () => void;
    onPrevious?: () => void;
    onNext?: () => void;
    style?: StyleProp<ViewStyle>;
    showNavigationArrows?: boolean;
    fullWidth?: boolean;
}

export function DateRangeFilter({
    range,
    onPress,
    onPrevious,
    onNext,
    style,
    showNavigationArrows = true,
    fullWidth = false
}: DateRangeFilterProps) {
    return (
        <DateRangeTrigger
            range={range}
            onPress={onPress}
            onPrevious={onPrevious}
            onNext={onNext}
            style={style}
            showNavigationArrows={showNavigationArrows}
            fullWidth={fullWidth}
        />
    );
}
