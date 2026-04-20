'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Project, ProjectStage, FilterState } from '@/lib/types'
import FilterBar from '@/components/FilterBar'
import GanttChart from '@/components/GanttChart'

type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

function applyFilters(projects: Project[], filters: FilterState): Project[] {
  return projects.filter((p) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(p.status)) return false
    if (filters.category !== 'all' && p.category !== filters.category) return false
    if (filters.assignee !== 'all') {
      const hasAssignee =
        p.responsible === filters.assignee ||
        p.stages.some((s) => s.assignee === filters.assignee)
      if (!hasAssignee) return false
    }
    if (filters.search && !p.name.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })
}

export default function GanttPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [stagesMap, setStagesMap] = useState<Record<string, ProjectStage[]>>({})
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    category: 'all',
    assignee: 'all',
    search: '',
  })

  // Load projects (metadata) + custom stages
  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then((r) => r.json()),
      fetch('/api/stages').then((r) => r.json()),
    ])
      .then(([projectsData, stagesData]: [Project[], Record<string, ProjectStage[]>]) => {
        setProjects(projectsData)
        setStagesMap(stagesData)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Merge: replace project.stages with custom stages from JSON
  const projectsWithStages = useMemo(() =>
    projects.map((p) => ({ ...p, stages: stagesMap[p.id] ?? [] })),
    [projects, stagesMap]
  )

  const filtered = useMemo(() =>
    applyFilters(projectsWithStages, filters)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW', { numeric: true })),
    [projectsWithStages, filters]
  )

  // ── Add stage ──────────────────────────────────────────────────────────────
  const handleAddStage = useCallback(async (
    projectId: string,
    name: string,
    startDate: string,
    endDate: string,
    colorIndex: number,
  ) => {
    setSyncStatus('saving')
    try {
      const res = await fetch('/api/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name, startDate, endDate, colorIndex }),
      })
      const { stageId } = await res.json()
      setStagesMap((prev) => ({
        ...prev,
        [projectId]: [
          ...(prev[projectId] ?? []),
          { stageId, name, startDate, endDate, assignee: null, colorIndex },
        ],
      }))
      setSyncStatus('saved')
      setTimeout(() => setSyncStatus('idle'), 2000)
    } catch {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus('idle'), 3000)
    }
  }, [])

  // ── Update stage (dates and/or name) ───────────────────────────────────────
  const handleUpdateStage = useCallback(async (
    projectId: string,
    stageId: string,
    updates: { name?: string; startDate?: string; endDate?: string },
  ) => {
    // Optimistic update
    setStagesMap((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).map((s) =>
        s.stageId === stageId ? { ...s, ...updates } : s
      ),
    }))
    setSyncStatus('saving')
    try {
      await fetch('/api/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, stageId, ...updates }),
      })
      setSyncStatus('saved')
      setTimeout(() => setSyncStatus('idle'), 2000)
    } catch {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus('idle'), 3000)
    }
  }, [])

  // ── Delete stage ───────────────────────────────────────────────────────────
  const handleDeleteStage = useCallback(async (projectId: string, stageId: string) => {
    setStagesMap((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).filter((s) => s.stageId !== stageId),
    }))
    setSyncStatus('saving')
    try {
      await fetch('/api/stages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, stageId }),
      })
      setSyncStatus('saved')
      setTimeout(() => setSyncStatus('idle'), 2000)
    } catch {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus('idle'), 3000)
    }
  }, [])

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">甘特圖</h1>
        <p className="text-zinc-500 text-sm mt-1">專案時程總覽</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-3 sm:p-4">
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 pb-3 border-b border-zinc-700/50">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-px h-4 bg-cyan-400/60 inline-block" />
              今天
            </span>
            <span className="hidden lg:inline">游標移到階段列 → 出現 <span className="text-zinc-400 font-medium">＋</span> 可新增階段</span>
            <span className="hidden xl:inline">雙擊階段條 → 編輯名稱／日期</span>
            <span className="lg:hidden text-zinc-600">＋ 新增 · 雙擊編輯 · 左右滑動看時程</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {syncStatus === 'saving' && (
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                儲存中...
              </span>
            )}
            {syncStatus === 'saved' && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                已儲存
              </span>
            )}
            {syncStatus === 'error' && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                儲存失敗
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-zinc-500 text-sm py-8 text-center">載入中...</div>
        ) : (
          <GanttChart
            projects={filtered}
            onUpdateStage={handleUpdateStage}
            onAddStage={handleAddStage}
            onDeleteStage={handleDeleteStage}
          />
        )}
      </div>
    </div>
  )
}
