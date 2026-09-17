import { useCallback, useRef, useState } from 'react';
import { AppConfig } from '@/src/constants';
import { useEaseInLayoutAnimation } from '@/src/hooks/useEaseInLayoutAnimation';
import { TextInput } from 'react-native';

interface UseExpandableSearchProps {
  value: string;
  onChangeText: (text: string) => void;
  onExpandChange?: (isExpanded: boolean) => void;
}

export function useExpandableSearch({
  value,
  onChangeText,
  onExpandChange,
}: UseExpandableSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const prepareLayoutAnimation = useEaseInLayoutAnimation();

  const shouldStayExpanded = value.length > 0;

  const handleExpand = useCallback(() => {
    prepareLayoutAnimation();
    setIsExpanded(true);
    onExpandChange?.(true);
    setTimeout(() => inputRef.current?.focus(), AppConfig.timing.focusDelayMs);
  }, [onExpandChange, prepareLayoutAnimation]);

  const handleCollapse = useCallback(() => {
    if (shouldStayExpanded) return;
    prepareLayoutAnimation();
    setIsExpanded(false);
    onExpandChange?.(false);
    inputRef.current?.blur();
  }, [shouldStayExpanded, onExpandChange, prepareLayoutAnimation]);

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
