import React from 'react'
import {
  Keyboard,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  KeyboardAvoidingViewProps,
  Platform,
} from 'react-native'

import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * KeyboardAvoidingView wrapper with sensible defaults
 */
export const KeyboardAvoidingView = ({
  children,
  behavior = Platform.OS === 'ios' ? 'padding' : 'height',
  style = { flex: 1 },
  keyboardVerticalOffset = 0,
  ...props
}: KeyboardAvoidingViewProps) => {
  return (
    <RNKeyboardAvoidingView
      behavior={behavior}
      style={style}
      keyboardVerticalOffset={keyboardVerticalOffset}
      {...props}
    >
      {children}
    </RNKeyboardAvoidingView>
  )
}

/**
 * Hook to track keyboard state
 */
export const useKeyboard = () => {
  const [keyboardHeight, setKeyboardHeight] = React.useState(0)
  const [isKeyboardVisible, setKeyboardVisible] = React.useState(false)

  const insets = useSafeAreaInsets()

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const extraHeight = Platform.OS === 'android' ? insets.bottom : 0
        setKeyboardHeight(Math.floor(e.endCoordinates.height + extraHeight))
        setKeyboardVisible(true)
      }
    )
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0)
        setKeyboardVisible(false)
      }
    )

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  return {
    keyboardHeight,
    isKeyboardVisible,
    dismiss: Keyboard.dismiss,
  }
}
