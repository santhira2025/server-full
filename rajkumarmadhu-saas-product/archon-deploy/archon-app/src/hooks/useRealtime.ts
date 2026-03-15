import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE_URL } from '../lib/api'

interface RealtimeEvent {
    type: 'events' | 'reviews' | 'heartbeat'
    items?: any[]
    time?: number
}

interface UseRealtimeOptions {
    onEvent?: (event: RealtimeEvent) => void
    onReview?: (event: RealtimeEvent) => void
    enabled?: boolean
}

export function useRealtime({ onEvent, onReview, enabled = true }: UseRealtimeOptions) {
    const [connected, setConnected] = useState(false)
    const [lastHeartbeat, setLastHeartbeat] = useState<number>(0)
    const eventSourceRef = useRef<EventSource | null>(null)

    useEffect(() => {
        if (!enabled) return

        const token = localStorage.getItem('archon_token')
        if (!token) return

        const url = `${API_BASE_URL}/api/sse/stream?token=${encodeURIComponent(token)}`
        const es = new EventSource(url)
        eventSourceRef.current = es

        es.onopen = () => setConnected(true)
        es.onerror = () => {
            setConnected(false)
            // EventSource auto-reconnects
        }

        es.addEventListener('heartbeat', (e) => {
            const data = JSON.parse(e.data)
            setLastHeartbeat(data.time)
            setConnected(true)
        })

        es.addEventListener('events', (e) => {
            const data = JSON.parse(e.data)
            onEvent?.(data)
        })

        es.addEventListener('reviews', (e) => {
            const data = JSON.parse(e.data)
            onReview?.(data)
        })

        return () => {
            es.close()
            eventSourceRef.current = null
            setConnected(false)
        }
    }, [enabled])

    return { connected, lastHeartbeat }
}

// Simple polling hook for data that needs regular refresh
export function usePolling<T>(
    fetcher: () => Promise<T>,
    intervalMs: number = 30000,
    deps: any[] = []
) {
    const [data, setData] = useState<T | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        try {
            const result = await fetcher()
            setData(result)
            setError(null)
        } catch (err: any) {
            setError(err.message || 'Failed to fetch')
        } finally {
            setLoading(false)
        }
    }, deps)

    useEffect(() => {
        refresh()
        const interval = setInterval(refresh, intervalMs)
        return () => clearInterval(interval)
    }, [refresh, intervalMs])

    return { data, loading, error, refresh }
}
