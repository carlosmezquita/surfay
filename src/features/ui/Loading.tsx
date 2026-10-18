import type { CSSProperties, ReactNode } from 'react'

/** Decorative geometry stays out of the accessibility tree; each region has one status. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />
}

export function LoadingStatus({
  children,
  visible = false,
}: {
  children: ReactNode
  visible?: boolean
}) {
  return (
    <p className={visible ? 'loading-status' : 'sr-only'} role="status">
      {children}
    </p>
  )
}
