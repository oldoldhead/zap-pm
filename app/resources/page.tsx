'use client'

import { useEffect, useState } from 'react'
import { Project, TeamMember, STAGE_NAMES, STATUS_COLORS, CATEGORY_TEXT_COLORS } from '@/lib/types'

const MEMBERS: TeamMember[] = ['瑜芸', '芷榕']

function getMemberWorkload(projects: Project[], member: TeamMember) {
  const assigned: { project: Project; stage: string; startDate: string; endDate: string }[] = []
  projects.forEach((p) => {
    p.stages.forEach((s) => {
      if (s.assignee === member && s.startDate && s.endDate) {
        assigned.push({ project: p, stage: s.name, startDate: s.startDate, endDate: s.endDate })
      }
    })
  })
  return assigned.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

function isOngoing(startDate: string, endDate: string): boolean {
  const today = new Date()
  return new Date(startDate) <= today && today <= new Date(endDate)
}

export default function ResourcesPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => { setProjects(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-6 text-zinc-500 text-sm">載入中...</div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">人力資源</h1>
        <p className="text-zinc-500 text-sm mt-1">人員任務分配一覽</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        {MEMBERS.map((member) => {
          const workload = getMemberWorkload(projects, member)
          const ongoing = workload.filter((w) => isOngoing(w.startDate, w.endDate))
          const responsibleCount = projects.filter((p) => p.responsible === member).length
          return (
            <div key={member} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">
                  {member[0]}
                </div>
                <div>
                  <p className="text-white font-medium">{member}</p>
                  <p className="text-zinc-500 text-xs">負責 {responsibleCount} 個專案</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-900/60 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs">總分配任務</p>
                  <p className="text-white text-xl font-bold mt-1">{workload.length}</p>
                </div>
                <div className="bg-zinc-900/60 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs">目前進行中</p>
                  <p className="text-cyan-400 text-xl font-bold mt-1">{ongoing.length}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {MEMBERS.map((member) => {
          const workload = getMemberWorkload(projects, member)
          return (
            <div key={member} className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs">
                  {member[0]}
                </div>
                <span className="text-zinc-200 text-sm font-medium">{member} 的任務</span>
                <span className="text-zinc-600 text-xs ml-auto">{workload.length} 項</span>
              </div>
              {workload.length === 0 ? (
                <p className="text-zinc-500 text-sm p-4">尚無分配任務</p>
              ) : (
                <div className="divide-y divide-zinc-700/40">
                  {workload.map((w, i) => {
                    const ongoing = isOngoing(w.startDate, w.endDate)
                    const stageIdx = STAGE_NAMES.indexOf(w.stage as (typeof STAGE_NAMES)[number])
                    const stageDotColors = ['bg-cyan-500', 'bg-blue-500', 'bg-violet-500', 'bg-fuchsia-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500']
                    return (
                      <div key={i} className={`px-4 py-3 flex items-center gap-3 ${ongoing ? 'bg-cyan-500/5' : ''}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${stageDotColors[stageIdx] ?? 'bg-zinc-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${CATEGORY_TEXT_COLORS[w.project.category]}`}>
                              {w.project.category}
                            </span>
                            <span className="text-zinc-200 text-xs truncate">{w.project.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-zinc-500 text-xs">{w.stage}</span>
                            <span className="text-zinc-600 text-xs">·</span>
                            <span className="text-zinc-500 text-xs">{w.startDate} ~ {w.endDate}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[w.project.status]}`}>
                            {w.project.status}
                          </span>
                          {ongoing && (
                            <span className="text-xs text-cyan-400 font-medium">進行中</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Projects by responsible */}
      <div>
        <h2 className="text-sm font-medium text-zinc-300 mb-3">負責專案列表</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {MEMBERS.map((member) => {
            const responsible = projects.filter((p) => p.responsible === member)
            return (
              <div key={member} className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-700/50">
                  <span className="text-zinc-200 text-sm font-medium">{member} 負責的專案</span>
                </div>
                <div className="divide-y divide-zinc-700/40">
                  {responsible.map((p) => (
                    <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                      <span className={`text-xs font-bold ${CATEGORY_TEXT_COLORS[p.category]}`}>{p.category}</span>
                      <span className="text-zinc-200 text-xs flex-1 truncate">{p.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>{p.status}</span>
                    </div>
                  ))}
                  {responsible.length === 0 && (
                    <p className="text-zinc-500 text-sm p-4">無負責專案</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
