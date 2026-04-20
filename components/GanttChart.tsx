'use client'

import { useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect } from 'react'
import { Project, CATEGORY_TEXT_COLORS, STAGE_PALETTE, STATUS_COLORS } from '@/lib/types'

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
const MIN_ROW_HEIGHT = 34
const LANE_HEIGHT = 28
const LANE_PAD = 6
const LABEL_WIDTH_MIN = 220
const LABEL_WIDTH_MAX = 1200
const LABEL_WIDTH_STORAGE_KEY = 'zap-gantt-label-width'
const HEADER_HEIGHT = 36
const HANDLE_WIDTH = 7
const LABEL_RESIZER_W = 6
const ZINC_900 = '#18181b'

/** 此寬度以上：顯示分類／狀態／+、可拖曳欄寬，欄寬沿用 LABEL_WIDTH_MIN 起跳；以下：僅專案名、欄寬依最長名稱緊湊計算 */
const VIEWPORT_DESKTOP_LABEL_UI_MIN = 1024

function readViewportWidth(): number {
  if (typeof window === 'undefined') return VIEWPORT_DESKTOP_LABEL_UI_MIN
  const vv = window.visualViewport
  return Math.max(1, Math.round(vv?.width ?? window.innerWidth))
}

/** 手機版專案欄：僅文字，左右 padding 與 text-xs 估寬 */
const LABEL_COMPACT_H_PAD = 24
const LABEL_COMPACT_CHAR_PX = 12
const LABEL_COMPACT_SAFETY = 8
const LABEL_COMPACT_MIN = 48

// 計算各階段所屬分層（避免重疊）
function assignLanes(stages: { stageId: string; startDate: string | null; endDate: string | null }[]): Map<string, number> {
  const laneMap = new Map<string, number>()
  const laneEndDates: string[] = []
  const valid = stages
    .filter((s) => s.startDate && s.endDate)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!))
  for (const s of valid) {
    let placed = false
    for (let i = 0; i < laneEndDates.length; i++) {
      if (s.startDate! >= laneEndDates[i]) {
        laneMap.set(s.stageId, i)
        laneEndDates[i] = s.endDate!
        placed = true
        break
      }
    }
    if (!placed) {
      laneMap.set(s.stageId, laneEndDates.length)
      laneEndDates.push(s.endDate!)
    }
  }
  return laneMap
}

function rowHeight(laneMap: Map<string, number>): number {
  const numLanes = laneMap.size === 0 ? 1 : Math.max(...laneMap.values()) + 1
  return Math.max(MIN_ROW_HEIGHT, LANE_HEIGHT * numLanes + LANE_PAD * 2)
}

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

interface LabelColumnDragState {
  startX: number
  startWidth: number
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
  /** null = 尚未手動調整，沿用建議寬度 */
  const [labelPaneWidthUser, setLabelPaneWidthUser] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(LABEL_WIDTH_STORAGE_KEY)
    if (raw == null) return null
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return null
    return Math.min(LABEL_WIDTH_MAX, Math.max(LABEL_WIDTH_MIN, n))
  })
  const [labelColumnDrag, setLabelColumnDrag] = useState<LabelColumnDragState | null>(null)
  /** true = 桌機版左欄 UI（分類／狀態／拖曳）；false = 手機僅專案名、緊湊欄寬 */
  const [viewportWideForLabelUi, setViewportWideForLabelUi] = useState(true)

  useLayoutEffect(() => {
    const sync = () => setViewportWideForLabelUi(readViewportWidth() >= VIEWPORT_DESKTOP_LABEL_UI_MIN)
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    const vv = window.visualViewport
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
    }
  }, [])

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

  /** 依最長專案名估算的建議寬度（未手動調整時使用） */
  const labelWidthSuggested = useMemo(() => {
    const CHAR_PX = 13
    const CHROME = 120
    const SAFETY = 20
    let maxChars = 0
    for (const p of projects) {
      maxChars = Math.max(maxChars, [...p.name].length)
    }
    return Math.max(LABEL_WIDTH_MIN, Math.ceil(CHROME + maxChars * CHAR_PX + SAFETY))
  }, [projects])

  /** 手機：欄寬僅依最長專案名稱（不含分類／狀態預留） */
  const labelWidthCompact = useMemo(() => {
    let maxChars = 0
    for (const p of projects) {
      maxChars = Math.max(maxChars, [...p.name].length)
    }
    return Math.max(
      LABEL_COMPACT_MIN,
      Math.ceil(LABEL_COMPACT_H_PAD + maxChars * LABEL_COMPACT_CHAR_PX + LABEL_COMPACT_SAFETY)
    )
  }, [projects])

  const labelWidth = Math.min(
    LABEL_WIDTH_MAX,
    Math.max(LABEL_WIDTH_MIN, labelPaneWidthUser ?? labelWidthSuggested)
  )

  const effectiveLabelWidth = viewportWideForLabelUi ? labelWidth : labelWidthCompact
  const showLabelResizer = viewportWideForLabelUi

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

  // 拖曳調整左側專案欄寬度
  useEffect(() => {
    if (!labelColumnDrag) return
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - labelColumnDrag.startX
      const next = Math.min(
        LABEL_WIDTH_MAX,
        Math.max(LABEL_WIDTH_MIN, labelColumnDrag.startWidth + dx)
      )
      setLabelPaneWidthUser(next)
    }
    const onUp = (e: MouseEvent) => {
      const dx = e.clientX - labelColumnDrag.startX
      const final = Math.min(
        LABEL_WIDTH_MAX,
        Math.max(LABEL_WIDTH_MIN, labelColumnDrag.startWidth + dx)
      )
      setLabelPaneWidthUser(final)
      try {
        localStorage.setItem(LABEL_WIDTH_STORAGE_KEY, String(final))
      } catch {
        /* ignore quota / private mode */
      }
      setLabelColumnDrag(null)
      if (scrollRef.current) scrollRef.current.style.cursor = 'grab'
    }
    if (scrollRef.current) scrollRef.current.style.cursor = 'col-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (scrollRef.current) scrollRef.current.style.cursor = 'grab'
    }
  }, [labelColumnDrag])

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
          onDelete={() => {
            onDeleteStage(editPopover.projectId, editPopover.stageId)
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

      {/* ── Single scrollable container (horizontal + vertical) ── */}
      <div
        ref={scrollRef}
        className="gantt-scroll-host max-h-[min(68dvh,560px)] md:max-h-[75vh] touch-pan-x touch-pan-y overscroll-x-contain overscroll-y-contain [-webkit-overflow-scrolling:touch]"
        style={{ overflowX: 'auto', overflowY: 'auto', cursor: 'grab' }}
        onMouseDown={onPanDown}
        onMouseMove={onPanMove}
        onMouseUp={onPanUp}
        onMouseLeave={onPanUp}
      >
        {/* Inner width: label + timeline */}
        <div
          style={{
            minWidth: effectiveLabelWidth + (showLabelResizer ? LABEL_RESIZER_W : 0) + totalWidth,
            position: 'relative',
          }}
        >

          {/* ── Sticky month-header row ── */}
          <div
            className="flex border-b border-zinc-700"
            style={{ position: 'sticky', top: 0, zIndex: 30, height: HEADER_HEIGHT, background: ZINC_900 }}
          >
            {/* Corner cell – sticky left too */}
            <div
              className="gantt-sticky-label shrink-0 flex items-center px-3 border-r border-zinc-700"
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 31,
                width: effectiveLabelWidth,
                background: ZINC_900,
              }}
            >
              <span className="text-zinc-500 text-xs font-medium">專案</span>
            </div>
            {showLabelResizer && (
              <div
                data-label-resizer
                role="separator"
                aria-orientation="vertical"
                aria-label="調整專案欄寬度"
                title="拖曳調整專案欄寬度"
                className="gantt-sticky-resizer shrink-0 cursor-col-resize hover:bg-cyan-500/20 bg-zinc-900/80 border-l border-zinc-600/50"
                style={{
                  position: 'sticky',
                  left: effectiveLabelWidth,
                  zIndex: 34,
                  width: LABEL_RESIZER_W,
                  alignSelf: 'stretch',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setLabelColumnDrag({ startX: e.clientX, startWidth: labelWidth })
                }}
              />
            )}
            {/* Month labels */}
            <div className="relative flex-1" style={{ width: totalWidth }}>
              {monthHeaders.map((m) => (
                <div
                  key={m.label}
                  className="absolute top-0 bottom-0 flex items-center justify-center text-xs text-zinc-500 border-l border-zinc-700/60"
                  style={{ left: m.left, width: m.width }}
                >
                  {m.label}
                </div>
              ))}
              {showToday && (
                <div className="absolute top-0 bottom-0 w-px bg-cyan-400/60 z-20" style={{ left: todayLeft }} />
              )}
            </div>
          </div>

          {/* ── Project rows ── */}
          {projects.map((project) => {
            const laneMap = assignLanes(project.stages)
            const rh = rowHeight(laneMap)
            return (
              <div
                key={project.id}
                className="flex border-b border-zinc-800/50 hover:bg-zinc-800/10 group/row"
                style={{ height: rh }}
              >
                {/* Label cell – sticky left；單行、欄寬依最長名稱動態加寬 */}
                <div
                  className="gantt-sticky-label shrink-0 flex items-center gap-2 min-w-0 px-3 border-r border-zinc-800/50 box-border"
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 20,
                    width: effectiveLabelWidth,
                    background: ZINC_900,
                    height: rh,
                  }}
                >
                  {viewportWideForLabelUi && (
                    <span className={`text-xs font-bold shrink-0 ${CATEGORY_TEXT_COLORS[project.category]}`}>
                      {project.category}
                    </span>
                  )}
                  {viewportWideForLabelUi && (
                    <span
                      className={`text-[10px] px-1.5 py-px rounded-full shrink-0 leading-tight whitespace-nowrap ${STATUS_COLORS[project.status]}`}
                    >
                      {project.status}
                    </span>
                  )}
                  <span
                    className={`text-zinc-200 text-xs truncate min-w-0 ${viewportWideForLabelUi ? 'flex-1' : 'w-full'}`}
                    title={project.name}
                  >
                    {project.name}
                  </span>
                  {viewportWideForLabelUi && (
                    <button
                      className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-cyan-400 hover:bg-zinc-700 transition-colors opacity-0 group-hover/row:opacity-100"
                      title="新增階段"
                      onMouseDown={(e) => e.stopPropagation()}
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
                  )}
                </div>
                {showLabelResizer && (
                  <div
                    data-label-resizer
                    role="separator"
                    aria-orientation="vertical"
                    aria-hidden
                    className="gantt-sticky-resizer shrink-0 cursor-col-resize hover:bg-cyan-500/15 bg-zinc-900/80 border-l border-zinc-700/40"
                    style={{
                      position: 'sticky',
                      left: effectiveLabelWidth,
                      zIndex: 21,
                      width: LABEL_RESIZER_W,
                      height: rh,
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setLabelColumnDrag({ startX: e.clientX, startWidth: labelWidth })
                    }}
                  />
                )}

                {/* Timeline cell */}
                <div className="relative shrink-0" style={{ width: totalWidth, height: rh }}>
                  {/* Month grid lines */}
                  {monthHeaders.map((m) => (
                    <div
                      key={m.label}
                      className="absolute top-0 bottom-0 border-l border-zinc-700/50"
                      style={{ left: m.left }}
                    />
                  ))}
                  {/* Today line */}
                  {showToday && (
                    <div className="absolute top-0 bottom-0 w-px bg-cyan-400/20 z-0" style={{ left: todayLeft }} />
                  )}

                  {/* No stages hint */}
                  {project.stages.length === 0 && (
                    <div className="absolute inset-0 flex items-center px-3">
                      <span className="text-zinc-700 text-xs italic">
                        {viewportWideForLabelUi ? '尚無階段，點左側 + 新增' : '尚無階段'}
                      </span>
                    </div>
                  )}

                  {/* Stage bars */}
                  {project.stages.map((stage, si) => {
                    if (!stage.startDate || !stage.endDate) return null

                    const lane = laneMap.get(stage.stageId) ?? 0
                    const barTop = LANE_PAD + lane * LANE_HEIGHT + 2
                    const barHeight = LANE_HEIGHT - 4

                    const { start: effStart, end: effEnd } = getEffectiveDates(
                      project.id, stage.stageId, stage.startDate, stage.endDate
                    )
                    const left = dayOffset(effStart) * DAY_WIDTH
                    const widthDays = Math.max(1, Math.ceil(
                      (new Date(effEnd).getTime() - new Date(effStart).getTime()) / 86400000
                    ) + 1)
                    const width = widthDays * DAY_WIDTH
                    const palette = STAGE_PALETTE[(stage.colorIndex ?? si) % STAGE_PALETTE.length]
                    const showLabel = width >= 32
                    const isBeingResized = resizing?.projectId === project.id && resizing?.stageId === stage.stageId

                    return (
                      <div
                        key={stage.stageId}
                        className="absolute rounded group/bar"
                        style={{
                          left,
                          top: barTop,
                          width,
                          height: barHeight,
                          backgroundColor: palette.bg,
                          opacity: isBeingResized ? 0.9 : 0.82,
                          zIndex: 10,
                          transition: resizing ? 'none' : 'opacity 0.1s',
                        }}
                        onMouseEnter={(e) => {
                          if (resizing) return
                          setTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            text: `${stage.name}  ${formatDate(stage.startDate!)} → ${formatDate(stage.endDate!)}  ｜ 雙擊編輯／刪除`,
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
                          setEditPopover({
                            projectId: project.id,
                            stageId: stage.stageId,
                            stageName: stage.name,
                            startDate: stage.startDate!,
                            endDate: stage.endDate!,
                            colorIndex: stage.colorIndex ?? si % STAGE_PALETTE.length,
                            x: e.clientX,
                            y: e.clientY,
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
                            style={{ color: palette.text, fontSize: 11, paddingLeft: HANDLE_WIDTH + 2, paddingRight: HANDLE_WIDTH + 4 }}
                          >
                            {stage.name}
                          </span>
                        )}

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
              </div>
            )
          })}
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
  onDelete,
  onClose,
}: {
  popover: EditPopover
  onSave: (name: string, start: string, end: string, colorIndex: number) => void
  onDelete: () => void
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
  const DIALOG_H = 360
  const left = Math.min(Math.max(8, popover.x), window.innerWidth - DIALOG_W - 8)
  const topBelow = popover.y + 6
  const topAbove = popover.y - DIALOG_H - 6
  const top = Math.min(
    Math.max(8, topBelow + DIALOG_H > window.innerHeight ? topAbove : topBelow),
    window.innerHeight - DIALOG_H - 8
  )

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

      {/* Delete */}
      <div className="mt-2 pt-2 border-t border-zinc-800">
        <button
          onClick={onDelete}
          className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20 text-xs rounded-lg py-1.5 transition-colors"
        >
          刪除此階段
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
  const DIALOG_H = 380
  const left = Math.min(Math.max(8, x), window.innerWidth - DIALOG_W - 8)
  const topBelow = y + 4
  const topAbove = y - DIALOG_H - 4
  const top = Math.min(
    Math.max(8, topBelow + DIALOG_H > window.innerHeight ? topAbove : topBelow),
    window.innerHeight - DIALOG_H - 8
  )

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
