'use client'

import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { Project, CATEGORY_TEXT_COLORS, STAGE_PALETTE } from '@/lib/types'

interface UpdatePayload {
  name?: string
  startDate?: string
  endDate?: string
  colorIndex?: number
}

interface GanttChartProps {
  projects: Project[]
  onUpdateStage: (projectId: string, stageId: string, updates: UpdatePayload) => void
  onAddStage: (projectId: string, name: string, startDate: string, endDate: string, colorIndex: number) => void
  onDeleteStage: (projectId: string, stageId: string) => void
}

const DAY_WIDTH = 5
const ROW_HEIGHT = 44
const LABEL_WIDTH = 210
const HEADER_HEIGHT = 36
const HANDLE_WIDTH = 7

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDate(dateStr: string): string {
  return dateStr.replace(/-/g, '/')
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysToday(days: number): string {
  return addDays(todayStr(), days)
}

interface ResizeState {
  projectId: string
  stageId: string
  side: 'start' | 'end'
  originalDate: string
  startX: number
  currentDate: string
}

interface EditPopover {
  projectId: string
  stageId: string
  stageName: string
  startDate: string
  endDate: string
  colorIndex: number
  x: number
  y: number
}

interface AddPopover {
  projectId: string
  x: number
  y: number
}

function getMonthHeaders(startDate: Date, totalDays: number) {
  const headers: { label: string; left: number; width: number }[] = []
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const endMs = startDate.getTime() + totalDays * 86400000
  while (cur.getTime() < endMs) {
    const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
    const offsetDays = Math.max(0, Math.ceil((cur.getTime() - startDate.getTime()) / 86400000))
    const endOfMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
    const endDays = Math.min(totalDays, Math.ceil((endOfMonth.getTime() - startDate.getTime()) / 86400000) + 1)
    const width = (endDays - offsetDays) * DAY_WIDTH
    headers.push({
      label: `${cur.getFullYear()}/${String(cur.getMonth() + 1).padStart(2, '0')}`,
      left: offsetDays * DAY_WIDTH,
      width,
    })
    cur.setMonth(cur.getMonth() + 1)
    if (daysInMonth === 0) break
  }
  return headers
}

export default function GanttChart({ projects, onUpdateStage, onAddStage, onDeleteStage }: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ active: boolean; startX: number; scrollLeft: number }>({ active: false, startX: 0, scrollLeft: 0 })
  const [resizing, setResizing] = useState<ResizeState | null>(null)
  const [editPopover, setEditPopover] = useState<EditPopover | null>(null)
  const [addPopover, setAddPopover] = useState<AddPopover | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const { startDate, totalDays } = useMemo(() => {
    const allDates: Date[] = []
    projects.forEach((p) => {
      p.stages.forEach((s) => {
        if (s.startDate) allDates.push(new Date(s.startDate))
        if (s.endDate) allDates.push(new Date(s.endDate))
      })
    })
    const now = new Date()
    const defaultStart = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    const defaultEnd = new Date(now.getFullYear() + 1, now.getMonth() + 1, 0)

    if (allDates.length === 0) {
      const days = Math.ceil((defaultEnd.getTime() - defaultStart.getTime()) / 86400000) + 1
      return { startDate: defaultStart, totalDays: days }
    }
    const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))
    const start = new Date(Math.min(defaultStart.getTime(), new Date(minDate.getFullYear(), minDate.getMonth(), 1).getTime()))
    const end = new Date(Math.max(defaultEnd.getTime(), new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0).getTime()))
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1
    return { startDate: start, totalDays: days }
  }, [projects])

  const totalWidth = totalDays * DAY_WIDTH
  const monthHeaders = useMemo(() => getMonthHeaders(startDate, totalDays), [startDate, totalDays])

  useEffect(() => {
    if (!scrollRef.current) return
    const today = new Date()
    const todayLeft = Math.ceil((today.getTime() - startDate.getTime()) / 86400000) * DAY_WIDTH
    const containerWidth = scrollRef.current.clientWidth
    scrollRef.current.scrollLeft = Math.max(0, todayLeft - containerWidth / 2)
  }, [startDate, projects])

  // Global mouse events for resize
  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const dxDays = Math.round((e.clientX - resizing.startX) / DAY_WIDTH)
      const newDate = addDays(resizing.originalDate, dxDays)
      setResizing((r) => r ? { ...r, currentDate: newDate } : null)
    }
    const onUp = (e: MouseEvent) => {
      const dxDays = Math.round((e.clientX - resizing.startX) / DAY_WIDTH)
      const newDate = addDays(resizing.originalDate, dxDays)
      const project = projects.find((p) => p.id === resizing.projectId)
      const stage = project?.stages.find((s) => s.stageId === resizing.stageId)
      if (stage) {
        const finalStart = resizing.side === 'start' ? newDate : (stage.startDate ?? newDate)
        const finalEnd = resizing.side === 'end' ? newDate : (stage.endDate ?? newDate)
        if (finalStart <= finalEnd) {
          onUpdateStage(resizing.projectId, resizing.stageId, { startDate: finalStart, endDate: finalEnd })
        }
      }
      setResizing(null)
      if (scrollRef.current) scrollRef.current.style.cursor = 'grab'
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resizing, projects, onUpdateStage])

  const onPanDown = useCallback((e: React.MouseEvent) => {
    if (resizing) return
    panRef.current = { active: true, startX: e.clientX, scrollLeft: scrollRef.current?.scrollLeft ?? 0 }
    if (scrollRef.current) scrollRef.current.style.cursor = 'grabbing'
  }, [resizing])

  const onPanMove = useCallback((e: React.MouseEvent) => {
    if (!panRef.current.active || resizing) return
    const dx = e.clientX - panRef.current.startX
    if (scrollRef.current) scrollRef.current.scrollLeft = panRef.current.scrollLeft - dx
  }, [resizing])

  const onPanUp = useCallback(() => {
    panRef.current.active = false
    if (scrollRef.current && !resizing) scrollRef.current.style.cursor = 'grab'
  }, [resizing])

  function dayOffset(dateStr: string) {
    return Math.ceil((new Date(dateStr).getTime() - startDate.getTime()) / 86400000)
  }

  function getEffectiveDates(projectId: string, stageId: string, startDateStr: string, endDateStr: string) {
    if (resizing && resizing.projectId === projectId && resizing.stageId === stageId) {
      return {
        start: resizing.side === 'start' ? resizing.currentDate : startDateStr,
        end: resizing.side === 'end' ? resizing.currentDate : endDateStr,
      }
    }
    return { start: startDateStr, end: endDateStr }
  }

  const today = new Date()
  const todayLeft = Math.ceil((today.getTime() - startDate.getTime()) / 86400000) * DAY_WIDTH
  const showToday = todayLeft >= 0 && todayLeft <= totalWidth

  if (projects.length === 0) {
    return <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">沒有符合條件的專案</div>
  }

  return (
    <div ref={containerRef} className="relative select-none">
      {/* Hover tooltip */}
      {tooltip && !resizing && (
        <div
          className="fixed z-50 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 pointer-events-none shadow-xl whitespace-nowrap"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Resize preview */}
      {resizing && (
        <div className="fixed z-50 bg-cyan-900 border border-cyan-600 text-cyan-200 text-xs rounded-lg px-3 py-2 pointer-events-none shadow-xl"
          style={{ left: 20, top: 20 }}>
          {resizing.side === 'start' ? '開始' : '結束'}：{formatDate(resizing.currentDate)}
        </div>
      )}

      {/* Edit popover */}
      {editPopover && (
        <EditPopoverDialog
          popover={editPopover}
          onSave={(name, start, end, colorIndex) => {
            onUpdateStage(editPopover.projectId, editPopover.stageId, { name, startDate: start, endDate: end, colorIndex })
            setEditPopover(null)
          }}
          onClose={() => setEditPopover(null)}
        />
      )}

      {/* Add stage popover */}
      {addPopover && (
        <AddStageDialog
          x={addPopover.x}
          y={addPopover.y}
          onAdd={(name, start, end, colorIndex) => {
            onAddStage(addPopover.projectId, name, start, end, colorIndex)
            setAddPopover(null)
          }}
          onClose={() => setAddPopover(null)}
        />
      )}

      <div className="flex">
        {/* Fixed label panel */}
        <div className="shrink-0 z-10 bg-zinc-900" style={{ width: LABEL_WIDTH }}>
          <div style={{ height: HEADER_HEIGHT }} className="border-b border-zinc-700" />
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center gap-2 px-3 border-b border-zinc-800/50 group/row"
              style={{ height: ROW_HEIGHT }}
            >
              <span className={`text-xs font-bold shrink-0 ${CATEGORY_TEXT_COLORS[project.category]}`}>
                {project.category}
              </span>
              <span className="text-zinc-200 text-xs truncate flex-1">{project.name}</span>
              {/* Add stage button */}
              <button
                className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-cyan-400 hover:bg-zinc-700 transition-colors opacity-0 group-hover/row:opacity-100"
                title="新增階段"
                onClick={(e) => {
                  e.stopPropagation()
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setAddPopover({ projectId: project.id, x: rect.left, y: rect.bottom + 4 })
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Scrollable timeline */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
          style={{ cursor: 'grab' }}
          onMouseDown={onPanDown}
          onMouseMove={onPanMove}
          onMouseUp={onPanUp}
          onMouseLeave={onPanUp}
        >
          <div style={{ width: totalWidth, position: 'relative' }}>
            {/* Month headers */}
            <div className="relative border-b border-zinc-700 bg-zinc-900" style={{ height: HEADER_HEIGHT }}>
              {monthHeaders.map((m) => (
                <div
                  key={m.label}
                  className="absolute top-0 bottom-0 flex items-center justify-center text-xs text-zinc-500 border-l border-zinc-800"
                  style={{ left: m.left, width: m.width }}
                >
                  {m.label}
                </div>
              ))}
              {showToday && (
                <div className="absolute top-0 bottom-0 w-px bg-cyan-400/60 z-20" style={{ left: todayLeft }} />
              )}
            </div>

            {/* Project rows */}
            {projects.map((project) => (
              <div
                key={project.id}
                className="relative border-b border-zinc-800/50 hover:bg-zinc-800/20"
                style={{ height: ROW_HEIGHT }}
              >
                {monthHeaders.map((m) => (
                  <div key={m.label} className="absolute top-0 bottom-0 border-l border-zinc-800/40" style={{ left: m.left }} />
                ))}
                {showToday && (
                  <div className="absolute top-0 bottom-0 w-px bg-cyan-400/20 z-0" style={{ left: todayLeft }} />
                )}

                {/* No stages hint */}
                {project.stages.length === 0 && (
                  <div className="absolute inset-0 flex items-center px-3">
                    <span className="text-zinc-700 text-xs italic">尚無階段，點左側 + 新增</span>
                  </div>
                )}

                {project.stages.map((stage, si) => {
                  if (!stage.startDate || !stage.endDate) return null

                  const { start: effStart, end: effEnd } = getEffectiveDates(
                    project.id, stage.stageId, stage.startDate, stage.endDate
                  )
                  const left = dayOffset(effStart) * DAY_WIDTH
                  const widthDays = Math.max(1, Math.ceil(
                    (new Date(effEnd).getTime() - new Date(effStart).getTime()) / 86400000
                  ) + 1)
                  const width = widthDays * DAY_WIDTH
                  const style = STAGE_PALETTE[(stage.colorIndex ?? si) % STAGE_PALETTE.length]
                  const showLabel = width >= 32
                  const isBeingResized = resizing?.projectId === project.id && resizing?.stageId === stage.stageId

                  return (
                    <div
                      key={stage.stageId}
                      className="absolute top-2 bottom-2 rounded group/bar"
                      style={{
                        left,
                        width,
                        backgroundColor: style.bg,
                        opacity: isBeingResized ? 0.9 : 0.82,
                        zIndex: 10,
                        transition: resizing ? 'none' : 'opacity 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        if (resizing) return
                        setTooltip({
                          x: e.clientX,
                          y: e.clientY,
                          text: `${stage.name}  ${formatDate(stage.startDate!)} → ${formatDate(stage.endDate!)}  ｜ 雙擊編輯`,
                        })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onMouseMove={(e) => {
                        if (resizing) return
                        setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setTooltip(null)
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setEditPopover({
                          projectId: project.id,
                          stageId: stage.stageId,
                          stageName: stage.name,
                          startDate: stage.startDate!,
                          endDate: stage.endDate!,
                          colorIndex: stage.colorIndex ?? si % STAGE_PALETTE.length,
                          x: rect.left,
                          y: rect.bottom + 6,
                        })
                      }}
                    >
                      {/* Left resize handle */}
                      <div
                        className="absolute top-0 bottom-0 left-0 z-20 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                        style={{ width: HANDLE_WIDTH, cursor: 'col-resize', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: '4px 0 0 4px' }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          setTooltip(null)
                          setResizing({
                            projectId: project.id,
                            stageId: stage.stageId,
                            side: 'start',
                            originalDate: stage.startDate!,
                            startX: e.clientX,
                            currentDate: stage.startDate!,
                          })
                          if (scrollRef.current) scrollRef.current.style.cursor = 'col-resize'
                        }}
                      >
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>⠿</span>
                      </div>

                      {/* Stage name label */}
                      {showLabel && (
                        <span
                          className="absolute inset-0 flex items-center truncate pointer-events-none"
                          style={{ color: style.text, fontSize: 11, paddingLeft: HANDLE_WIDTH + 2, paddingRight: HANDLE_WIDTH + 20 }}
                        >
                          {stage.name}
                        </span>
                      )}

                      {/* Delete button */}
                      <button
                        className="absolute top-0 bottom-0 z-20 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                        style={{ right: HANDLE_WIDTH, width: 18, cursor: 'pointer' }}
                        title="刪除此階段"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setTooltip(null)
                          onDeleteStage(project.id, stage.stageId)
                        }}
                      >
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1 }}>×</span>
                      </button>

                      {/* Right resize handle */}
                      <div
                        className="absolute top-0 bottom-0 right-0 z-20 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                        style={{ width: HANDLE_WIDTH, cursor: 'col-resize', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: '0 4px 4px 0' }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          setTooltip(null)
                          setResizing({
                            projectId: project.id,
                            stageId: stage.stageId,
                            side: 'end',
                            originalDate: stage.endDate!,
                            startX: e.clientX,
                            currentDate: stage.endDate!,
                          })
                          if (scrollRef.current) scrollRef.current.style.cursor = 'col-resize'
                        }}
                      >
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>⠿</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shared color picker ─────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  return (
    <div>
      <label className="text-zinc-500 text-xs block mb-1.5">顏色</label>
      <div className="flex gap-1.5 flex-wrap">
        {STAGE_PALETTE.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className="w-6 h-6 rounded-full transition-transform hover:scale-110"
            style={{
              backgroundColor: c.bg,
              outline: value === i ? `2px solid white` : '2px solid transparent',
              outlineOffset: 2,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Edit Popover ────────────────────────────────────────────────────────────

function EditPopoverDialog({
  popover,
  onSave,
  onClose,
}: {
  popover: EditPopover
  onSave: (name: string, start: string, end: string, colorIndex: number) => void
  onClose: () => void
}) {
  const [name, setName] = useState(popover.stageName)
  const [start, setStart] = useState(popover.startDate)
  const [end, setEnd] = useState(popover.endDate)
  const [colorIndex, setColorIndex] = useState(popover.colorIndex)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  const DIALOG_W = 264
  const DIALOG_H = 290
  const left = Math.min(Math.max(8, popover.x), window.innerWidth - DIALOG_W - 8)
  const fitsBelow = popover.y + DIALOG_H + 8 <= window.innerHeight
  const top = fitsBelow ? popover.y : Math.max(8, popover.y - DIALOG_H - 8)

  return (
    <div
      ref={ref}
      className="bg-zinc-900 border border-zinc-600 rounded-xl shadow-2xl p-4 w-64"
      style={{ position: 'fixed', left, top, zIndex: 100 }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-zinc-400 text-xs">編輯階段</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-zinc-500 text-xs block mb-1">階段名稱</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-zinc-500 text-xs block mb-1">開始日期</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-zinc-500 text-xs block mb-1">結束日期</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <ColorPicker value={colorIndex} onChange={setColorIndex} />
      </div>

      {start > end && (
        <p className="text-rose-400 text-xs mt-2">開始日期不能晚於結束日期</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => { if (start <= end && name.trim()) onSave(name.trim(), start, end, colorIndex) }}
          disabled={start > end || !name.trim()}
          className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg py-1.5 transition-colors font-medium"
        >
          儲存
        </button>
        <button
          onClick={onClose}
          className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg py-1.5 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  )
}

// ─── Add Stage Dialog ─────────────────────────────────────────────────────────

function AddStageDialog({
  x,
  y,
  onAdd,
  onClose,
}: {
  x: number
  y: number
  onAdd: (name: string, start: string, end: string, colorIndex: number) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [start, setStart] = useState(todayStr())
  const [end, setEnd] = useState(addDaysToday(30))
  const [colorIndex, setColorIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  const DIALOG_W = 264
  const DIALOG_H = 310
  const left = Math.min(Math.max(8, x), window.innerWidth - DIALOG_W - 8)
  const fitsBelow = y + DIALOG_H + 8 <= window.innerHeight
  const top = fitsBelow ? y : Math.max(8, y - DIALOG_H - 8)

  return (
    <div
      ref={ref}
      className="bg-zinc-900 border border-cyan-700/60 rounded-xl shadow-2xl p-4 w-64"
      style={{ position: 'fixed', left, top, zIndex: 100 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-cyan-400 text-xs font-medium">新增階段</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-zinc-500 text-xs block mb-1">階段名稱</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：提案 / 生產 / 展期…"
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500 placeholder:text-zinc-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim() && start <= end) onAdd(name.trim(), start, end, colorIndex)
            }}
          />
        </div>
        <div>
          <label className="text-zinc-500 text-xs block mb-1">開始日期</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-zinc-500 text-xs block mb-1">結束日期</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <ColorPicker value={colorIndex} onChange={setColorIndex} />
      </div>

      {start > end && (
        <p className="text-rose-400 text-xs mt-2">開始日期不能晚於結束日期</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => { if (name.trim() && start <= end) onAdd(name.trim(), start, end, colorIndex) }}
          disabled={!name.trim() || start > end}
          className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg py-1.5 transition-colors font-medium"
        >
          新增
        </button>
        <button
          onClick={onClose}
          className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg py-1.5 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  )
}
