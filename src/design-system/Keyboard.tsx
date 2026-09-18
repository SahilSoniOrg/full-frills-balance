import React from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Hook to track keyboard state
 */
export const useKeyboard = (enabled = true) => {
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const [isKeyboardVisible, setKeyboardVisible] = React.useState(false);

  const insets = useSafeAreaInsets();

  React.useEffect(() => {
    if (!enabled) return;

    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => {
        const extraHeight = Platform.OS === 'android' ? insets.bottom : 0;
        setKeyboardHeight(Math.floor(e.endCoordinates.height + extraHeight));
        setKeyboardVisible(true);
      },
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setKeyboardVisible(false);
      },
    );

    return () => {
      showSubscription?.remove();
      hideSubscription?.remove();
    };
  }, [enabled, insets.bottom]);

  return {
    keyboardHeight,
    isKeyboardVisible,
    dismiss: Keyboard.dismiss,
  };
};
