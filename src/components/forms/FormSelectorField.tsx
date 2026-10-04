import { Icon } from '@/src/components/core';
import { FormRow } from './FormRow';
import React from 'react';
import { View, type ViewStyle } from 'react-native';

interface FormSelectorFieldProps {
  label?: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
  onClear?: () => void;
  containerStyle?: ViewStyle;
  testID?: string;
}

export const FormSelectorField: React.FC<FormSelectorFieldProps> = ({
  label,
  value,
  placeholder,
  onPress,
  onClear,
  containerStyle,
  testID,
}) => (
  <View style={containerStyle}>
    <FormRow
      icon={Icon.Tag}
      title={label ?? value}
      value={label ? value : undefined}
      placeholder={placeholder}
      onPress={onPress}
      onClear={onClear}
      testID={testID}
    />
  </View>
);
