import { CLIENT_DEPLOY_DATE, CLIENT_DEPLOY_TIME } from '@/lib/deploy-check'

/** 部署版號（請在 lib/deploy-check.ts 以台灣時間更新） */
export function DeployVersionStamp({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1 ${className}`}>
      <span className="tabular-nums">
        前端-{CLIENT_DEPLOY_DATE}-{CLIENT_DEPLOY_TIME}
      </span>
      <span className="text-zinc-500">（台灣時間）</span>
    </span>
  )
}
