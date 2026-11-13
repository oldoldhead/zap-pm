'use client'

import { Star } from 'lucide-react'

interface WatchToggleProps {
  watched: boolean
  onToggle: () => void
  /** 較小的點擊區（甘特左欄） */
  compact?: boolean
  className?: string
}

/** 關注星號開關 */
export default function WatchToggle({ watched, onToggle, compact, className = '' }: WatchToggleProps) {
  return (
    <button
      type="button"
      title={watched ? '取消關注' : '加入關注'}
      aria-label={watched ? '取消關注' : '加入關注'}
      aria-pressed={watched}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={`shrink-0 rounded flex items-center justify-center transition-colors ${
        compact ? 'w-5 h-5' : 'w-7 h-7'
      } ${
        watched
          ? 'text-amber-400 hover:text-amber-300'
          : 'text-zinc-600 hover:text-amber-400/80'
      } ${className}`}
    >
      <Star
        size={compact ? 14 : 16}
        fill={watched ? 'currentColor' : 'none'}
        strokeWidth={watched ? 0 : 2}
      />
    </button>
  )
}
