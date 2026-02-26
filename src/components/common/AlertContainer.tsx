import { PopupModal } from '@/src/components/common/PopupModal'
import { AppText } from '@/src/components/core/AppText'
import { AlertPayload, clearAlertListener, clearConfirmListener, ConfirmPayload, setAlertListener, setConfirmListener } from '@/src/utils/alerts'
import React, { useEffect, useState } from 'react'

type AlertState = {
    type: 'alert'
    payload: AlertPayload
} | {
    type: 'confirm'
    payload: ConfirmPayload
} | null

export function AlertContainer() {
    const [activeAlert, setActiveAlert] = useState<AlertState>(null)

    useEffect(() => {
        setAlertListener((payload) => {
            setActiveAlert({ type: 'alert', payload })
        })

        setConfirmListener((payload) => {
            setActiveAlert({ type: 'confirm', payload })
        })

        return () => {
            clearAlertListener()
            clearConfirmListener()
        }
    }, [])

    if (!activeAlert) return null

    if (activeAlert.type === 'alert') {
        const { payload } = activeAlert
        return (
            <PopupModal
                visible={true}
                title={payload.title || 'Alert'}
                onClose={() => setActiveAlert(null)}
                actions={[
                    {
                        label: 'OK',
                        onPress: () => setActiveAlert(null),
                        variant: 'primary',
                    }
                ]}
                fixedHeight={false}
            >
                <AppText>{payload.message}</AppText>
            </PopupModal>
        )
    }

    if (activeAlert.type === 'confirm') {
        const { payload } = activeAlert
        return (
            <PopupModal
                visible={true}
                title={payload.title}
                onClose={() => {
                    payload.onCancel()
                    setActiveAlert(null)
                }}
                actions={[
                    {
                        label: payload.cancelText || 'Cancel',
                        onPress: () => {
                            payload.onCancel()
                            setActiveAlert(null)
                        },
                        variant: 'outline',
                    },
                    {
                        label: payload.confirmText || 'Confirm',
                        onPress: () => {
                            payload.onConfirm()
                            setActiveAlert(null)
                        },
                        variant: payload.destructive ? 'destructive' : 'primary',
                    }
                ]}
                fixedHeight={false}
            >
                <AppText>{payload.message}</AppText>
            </PopupModal>
        )
    }

    return null
}
