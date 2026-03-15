import { useState, useCallback } from 'react'

export interface Toast {
    id: string
    type: 'success' | 'error' | 'info' | 'warning'
    title: string
    message?: string
    duration?: number
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const newToast = { ...toast, id }
        setToasts(prev => [...prev, newToast])

        // Auto-remove after duration
        const duration = toast.duration || 5000
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)

        return id
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    return { toasts, addToast, removeToast }
}
