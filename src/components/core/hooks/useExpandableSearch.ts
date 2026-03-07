import { useCallback, useRef, useState } from 'react';
import { AppConfig } from '@/src/constants';
import { LayoutAnimation, TextInput } from 'react-native';

interface UseExpandableSearchProps {
    value: string;
    onChangeText: (text: string) => void;
    onExpandChange?: (isExpanded: boolean) => void;
}

export function useExpandableSearch({ value, onChangeText, onExpandChange }: UseExpandableSearchProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const inputRef = useRef<TextInput>(null);

    const shouldStayExpanded = value.length > 0;

    const handleExpand = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(true);
        onExpandChange?.(true);
        // Small delay to ensure input is rendered before focus
        setTimeout(() => inputRef.current?.focus(), AppConfig.timing.focusDelayMs);
    }, [onExpandChange]);

    const handleCollapse = useCallback(() => {
        if (shouldStayExpanded) return;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(false);
        onExpandChange?.(false);
        inputRef.current?.blur();
    }, [shouldStayExpanded, onExpandChange]);

    const handleClear = useCallback(() => {
        onChangeText('');
        inputRef.current?.focus();
    }, [onChangeText]);

    return {
        isExpanded: isExpanded || shouldStayExpanded,
        handleExpand,
        handleCollapse,
        handleClear,
        inputRef,
    };
}
