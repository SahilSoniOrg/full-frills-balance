/**
 * Unified Alert Service
 * 
 * Provides consistent alert patterns across the app:
 * - Toast: Non-blocking notifications (auto-dismiss)
 * - Alert: Simple dialogs for errors/warnings
 * - Confirm: Confirmation dialogs for destructive actions
 * 
 * Usage:
 *   toast.success('Saved!')
 *   toast.error('Failed to save')
 *   alert.show({ title: 'Error', message: 'Something went wrong' })
 *   confirm.show({ title: 'Delete?', message: 'This cannot be undone', onConfirm: () => {} })
 */

import { handleError } from '@/src/utils/errors'
import { logger } from '@/src/utils/logger'
import { AppConfig } from '@/src/constants'
import { Alert, Platform } from 'react-native'

// Toast configuration
export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastOptions {
  duration?: number // milliseconds, default 3000
  type?: ToastType
}

export interface ToastPayload {
  message: string
  type: ToastType
  duration: number
}

// Alert configuration
export interface AlertOptions {
  title?: string
  message: string
  type?: 'error' | 'warning' | 'info'
}

export interface AlertPayload extends AlertOptions {
  id: string
}

// Confirm configuration
export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel?: () => void
  destructive?: boolean // If true, confirm button is red/destructive
}

export interface ConfirmPayload extends Omit<ConfirmOptions, 'onConfirm' | 'onCancel'> {
  id: string
  onConfirm: () => void
  onCancel: () => void
}

// Event emitters for notifications
type ToastListener = (payload: ToastPayload) => void
let toastListener: ToastListener | null = null

export const setToastListener = (listener: ToastListener) => {
  toastListener = listener
}

export const clearToastListener = () => {
  toastListener = null
}

type AlertListener = (payload: AlertPayload) => void
let alertListener: AlertListener | null = null

export const setAlertListener = (listener: AlertListener) => {
  alertListener = listener
}

export const clearAlertListener = () => {
  alertListener = null
}

type ConfirmListener = (payload: ConfirmPayload) => void
let confirmListener: ConfirmListener | null = null

export const setConfirmListener = (listener: ConfirmListener) => {
  confirmListener = listener
}

export const clearConfirmListener = () => {
  confirmListener = null
}

// === TOAST API ===

export const toast = {
  success: (message: string, options?: ToastOptions) => {
    showToast(message, 'success', options?.duration)
  },

  error: (message: string, options?: ToastOptions) => {
    showToast(message, 'error', options?.duration)
  },

  warning: (message: string, options?: ToastOptions) => {
    showToast(message, 'warning', options?.duration)
  },

  info: (message: string, options?: ToastOptions) => {
    showToast(message, 'info', options?.duration)
  },
}

function showToast(message: string, type: ToastType, duration?: number) {
  const resolvedDuration = duration ?? AppConfig.timing.toastDurationMs

  // Emit to registered listener (ToastProvider)
  if (toastListener) {
    toastListener({
      message,
      type,
      duration: resolvedDuration,
    })
  } else {
    // Fallback to native alert if no toast provider (shouldn't happen in normal use)
    logger.warn('Toast listener not registered, falling back to Alert')
    Alert.alert(typeToTitle(type), message)
  }
}

function typeToTitle(type: ToastType): string {
  switch (type) {
    case 'success': return AppConfig.strings.alerts.success
    case 'error': return AppConfig.strings.alerts.error
    case 'warning': return AppConfig.strings.alerts.warning
    case 'info': return AppConfig.strings.alerts.info
  }
}

// === ALERT API ===

export const alert = {
  show: (options: AlertOptions) => {
    if (alertListener) {
      alertListener({
        ...options,
        id: Date.now().toString(),
      })
      return
    }

    const title = options.title || typeToTitle(options.type || 'info')
    const message = options.message

    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`)
    } else {
      Alert.alert(title, message)
    }
  },
}

// === ERROR HANDLING ===

export const showErrorAlert = (error: unknown, customTitle?: string, useSameErrorMessage?: boolean) => {
  const appError = handleError(error)

  logger.error('App Error', error, {
    message: appError.message,
    code: appError.code,
    statusCode: appError.statusCode,
  })

  let title = customTitle || AppConfig.strings.alerts.error
  let message = appError.message

  // Provide user-friendly messages for common errors
  switch (appError.code) {
    case 'VALIDATION_ERROR':
      title = AppConfig.strings.alerts.validationError
      break
    case 'DATABASE_ERROR':
      title = AppConfig.strings.alerts.databaseError
      message = AppConfig.strings.alerts.databaseErrorMessage
      break
    case 'NETWORK_ERROR':
      title = AppConfig.strings.alerts.connectionError
      message = AppConfig.strings.alerts.networkErrorMessage
      break
    default:
      message = AppConfig.strings.alerts.genericError
  }

  if (useSameErrorMessage) {
    message = appError.message
  }

  alert.show({ title, message, type: 'error' })
}

// === SUCCESS MESSAGES ===

export const showSuccessAlert = (title: string, message: string) => {
  alert.show({ title, message, type: 'info' })
  // Also show toast for success
  toast.success(message)
}

// === CONFIRMATION DIALOGS ===

export const confirm = {
  show: (options: ConfirmOptions) => {
    if (confirmListener) {
      confirmListener({
        ...options,
        id: Date.now().toString(),
        // Wrap callbacks to ensure listener can handle them
        onConfirm: options.onConfirm,
        onCancel: options.onCancel || (() => { }),
      })
      return
    }

    const {
      title,
      message,
      confirmText = AppConfig.strings.common.confirm,
      cancelText = AppConfig.strings.common.cancel,
      onConfirm,
      onCancel,
      destructive = false,
    } = options

    if (Platform.OS === 'web') {
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
            text: cancelText,
            style: 'cancel',
            onPress: onCancel,
          },
          {
            text: confirmText,
            style: destructive ? 'destructive' : 'default',
            onPress: onConfirm,
          },
        ]
      )
    }
  },
}

// Backwards compatibility - redirect to new API
export const showConfirmationAlert = (
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
) => {
  confirm.show({ title, message, onConfirm, onCancel })
}
