import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { getUserOrgs, switchOrg as switchOrgApi, syncOrgs as syncOrgsApi } from '../lib/api'

export interface Org {
  id: string
  githubLogin: string
  type: string
  avatarUrl: string | null
  plan: string
  hasAppInstalled: boolean
  isDefault: boolean
  role: string
}

interface OrgContextValue {
  orgs: Org[]
  currentOrg: Org | null
  loading: boolean
  switchOrg: (orgId: string) => Promise<void>
  refreshOrgs: () => Promise<void>
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  currentOrg: null,
  loading: false,
  switchOrg: async () => {},
  refreshOrgs: async () => {},
})

export function OrgProvider({ children, token }: { children: ReactNode; token: string | null }) {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchOrgs = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getUserOrgs()
      setOrgs(data.orgs || [])
      setCurrentOrgId(data.currentOrgId || null)
    } catch (err) {
      console.error('Failed to fetch orgs', err)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchOrgs()
  }, [fetchOrgs])

  const switchOrg = useCallback(async (orgId: string) => {
    await switchOrgApi(orgId)
    setCurrentOrgId(orgId)
    // Trigger a page reload to refresh all data for the new org
    window.location.reload()
  }, [])

  const refreshOrgs = useCallback(async () => {
    await syncOrgsApi()
    await fetchOrgs()
  }, [fetchOrgs])

  const currentOrg = orgs.find(o => o.id === currentOrgId) || null

  return (
    <OrgContext.Provider value={{ orgs, currentOrg, loading, switchOrg, refreshOrgs }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  return useContext(OrgContext)
}
