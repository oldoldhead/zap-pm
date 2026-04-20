'use client'

import { FilterState, ProjectCategory, ProjectStatus, TeamMember, CATEGORY_LABELS } from '@/lib/types'

interface FilterBarProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string; activeClass: string }[] = [
  { value: '執行中',   label: '執行中',   activeClass: 'bg-amber-600 text-amber-100 border-amber-500' },
  { value: '提案中',   label: '提案中',   activeClass: 'bg-blue-700 text-blue-100 border-blue-500' },
  { value: '等待結果', label: '等待結果', activeClass: 'bg-violet-700 text-violet-100 border-violet-500' },
  { value: '未開始',   label: '未開始',   activeClass: 'bg-zinc-600 text-zinc-100 border-zinc-400' },
  { value: '已結案',   label: '已結案',   activeClass: 'bg-green-700 text-green-100 border-green-500' },
  { value: '未通過',   label: '未通過',   activeClass: 'bg-red-800 text-red-100 border-red-600' },
  { value: '待結算',   label: '待結算',   activeClass: 'bg-teal-700 text-teal-100 border-teal-500' },
]

const categories: (ProjectCategory | 'all')[] = ['all', '0', 'A', 'B', 'C', 'D', 'E', 'X']
const assignees: (TeamMember | 'all')[] = ['all', '瑜芸', '芷榕']

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  function toggleStatus(status: ProjectStatus) {
    const current = filters.statuses
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status]
    onChange({ ...filters, statuses: next })
  }

  const hasFilter =
    filters.statuses.length > 0 ||
    filters.category !== 'all' ||
    filters.assignee !== 'all' ||
    filters.search

  return (
    <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
      {/* Search */}
      <input
        type="text"
        placeholder="搜尋專案..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 w-full min-w-0 sm:w-48 focus:outline-none focus:border-cyan-500 placeholder-zinc-500"
      />

      {/* Status multi-select toggle buttons */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((s) => {
          const active = filters.statuses.includes(s.value)
          return (
            <button
              key={s.value}
              onClick={() => toggleStatus(s.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? s.activeClass
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Category */}
      <select
        value={filters.category}
        onChange={(e) => onChange({ ...filters, category: e.target.value as ProjectCategory | 'all' })}
        className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500 cursor-pointer"
      >
        <option value="all">全部類別</option>
        {categories.slice(1).map((c) => (
          <option key={c} value={c}>{c} - {CATEGORY_LABELS[c as ProjectCategory]}</option>
        ))}
      </select>

      {/* Assignee */}
      <select
        value={filters.assignee}
        onChange={(e) => onChange({ ...filters, assignee: e.target.value as TeamMember | 'all' })}
        className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500 cursor-pointer"
      >
        <option value="all">全部人員</option>
        {assignees.slice(1).map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>

      {/* Clear */}
      {hasFilter && (
        <button
          onClick={() => onChange({ statuses: [], category: 'all', assignee: 'all', search: '' })}
          className="text-xs text-zinc-400 hover:text-cyan-400 transition-colors px-2 py-2"
        >
          清除篩選
        </button>
      )}
    </div>
  )
}
