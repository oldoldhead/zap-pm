'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadWatchedProjectIds, saveWatchedProjectIds } from '@/lib/watched-projects'

/** 關注專案（localStorage），儀表板／甘特共用 */
export function useWatchedProjects() {
  const [ids, setIds] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setIds(loadWatchedProjectIds())
    setReady(true)
  }, [])

  const watchedSet = useMemo(() => new Set(ids), [ids])

  const isWatched = useCallback((projectId: string) => watchedSet.has(projectId), [watchedSet])

  const toggleWatch = useCallback((projectId: string) => {
    setIds((prev) => {
      const next = prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
      saveWatchedProjectIds(next)
      return next
    })
  }, [])

  return {
    watchedIds: ids,
    watchedSet,
    watchedCount: ids.length,
    isWatched,
    toggleWatch,
    ready,
  }
}
