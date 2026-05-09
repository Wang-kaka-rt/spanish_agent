import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  noPad?: boolean
}

export function Panel({ title, description, children, actions, footer, className, bodyClassName, noPad }: Props) {
  return (
    <section className={`section-card${className ? ` ${className}` : ''}`}>
      <div className="section-card-header">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div> : null}
      </div>
      <div className={`section-card-body${noPad ? '' : ''}${bodyClassName ? ` ${bodyClassName}` : ''}`}
        style={noPad ? { padding: 0 } : undefined}
      >
        {children}
      </div>
      {footer ? (
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
          {footer}
        </div>
      ) : null}
    </section>
  )
}
