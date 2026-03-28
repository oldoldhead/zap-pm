'use client'

import { useEffect, useState } from 'react'
import { Project, ProjectStatus, STATUS_COLORS, CATEGORY_LABELS, CATEGORY_TEXT_COLORS, FilterState } from '@/lib/types'
import FilterBar from '@/components/FilterBar'

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

const ALL_STATUSES: { label: string; status: ProjectStatus; color: string }[] = [
  { label: '執行中',   status: '執行中',   color: 'text-amber-400' },
  { label: '提案中',   status: '提案中',   color: 'text-blue-400' },
  { label: '等待結果', status: '等待結果', color: 'text-violet-400' },
  { label: '未開始',   status: '未開始',   color: 'text-zinc-400' },
  { label: '已結案',   status: '已結案',   color: 'text-green-400' },
  { label: '未通過',   status: '未通過',   color: 'text-red-400' },
  { label: '待結算',   status: '待結算',   color: 'text-teal-400' },
]

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    category: 'all',
    assignee: 'all',
    search: '',
  })

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => { setProjects(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = applyFilters(projects, filters)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW', { numeric: true }))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">儀表板</h1>
        <p className="text-zinc-500 text-sm mt-1">所有專案總覽</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-8 gap-3">
        <div className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700/50">
          <p className="text-zinc-500 text-xs mb-1">全部專案</p>
          <p className="text-2xl font-bold text-white">{projects.length}</p>
        </div>
        {ALL_STATUSES.map((s) => (
          <div key={s.status} className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700/50">
            <p className="text-zinc-500 text-xs mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>
              {projects.filter((p) => p.status === s.status).length}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Project list — flat table */}
      {loading ? (
        <div className="text-zinc-500 text-sm">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-zinc-500 text-sm">沒有符合條件的專案</div>
      ) : (
        <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_6rem_6rem_6rem] gap-4 px-4 py-2.5 border-b border-zinc-700/50 text-xs text-zinc-500 font-medium">
            <span>類</span>
            <span>專案名稱</span>
            <span>類別</span>
            <span>負責人</span>
            <span>狀態</span>
          </div>
          {/* Rows */}
          {filtered.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectRow({ project }: { project: Project }) {
  const activeStages = project.stages.filter((s) => s.startDate)
  const progress = Math.round((activeStages.length / 7) * 100)
  const lastStage = activeStages[activeStages.length - 1]

  return (
    <div className="grid grid-cols-[2rem_1fr_6rem_6rem_6rem] gap-4 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-700/20 transition-colors items-center">
      {/* Category badge */}
      <span className={`text-xs font-bold ${CATEGORY_TEXT_COLORS[project.category]}`}>
        {project.category}
      </span>

      {/* Name + progress */}
      <div className="min-w-0">
        <p className="text-zinc-200 text-sm truncate">{project.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden max-w-[160px]">
            <div className="h-full bg-cyan-500/70 rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-zinc-600 text-xs shrink-0">
            {lastStage ? lastStage.name : '—'}
          </span>
        </div>
      </div>

      {/* Category label */}
      <span className="text-zinc-400 text-xs truncate">{CATEGORY_LABELS[project.category]}</span>

      {/* Responsible */}
      <span className="text-zinc-400 text-xs">{project.responsible ?? '—'}</span>

      {/* Status badge */}
      <span className={`text-xs px-2 py-0.5 rounded-full text-center ${STATUS_COLORS[project.status]}`}>
        {project.status}
      </span>
    </div>
  )
}
