import { Alert, Platform } from 'react-native'
import { handleError } from '../utils/errors'
import { logger } from '../utils/logger'

export const showErrorAlert = (error: unknown, customTitle?: string) => {
  const appError = handleError(error)

  logger.error('App Error', error, {
    message: appError.message,
    code: appError.code,
    statusCode: appError.statusCode,
  })

  let title = customTitle || 'Error'
  let message = appError.message

  // Provide user-friendly messages for common errors
  switch (appError.code) {
    case 'VALIDATION_ERROR':
      title = 'Validation Error'
      break
    case 'DATABASE_ERROR':
      title = 'Database Error'
      message = 'There was a problem saving your data. Please try again.'
      break
    case 'NETWORK_ERROR':
      title = 'Connection Error'
      message = 'Please check your internet connection and try again.'
      break
    default:
      message = 'Something went wrong. Please try again.'
  }

  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`)
  } else {
    Alert.alert(title, message)
  }
}

export const showSuccessAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`)
  } else {
    Alert.alert(title, message)
  }
}

export const showConfirmationAlert = (
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
) => {
  if (Platform.OS === 'web') {
    // Use window.confirm for web platform
    const confirmed = window.confirm(`${title}\n\n${message}`)
    if (confirmed) {
      onConfirm()
    } else {
      onCancel?.()
    }
  } else {
    Alert.alert(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: onCancel
        },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: onConfirm
        }
      ]
    )
  }
}
