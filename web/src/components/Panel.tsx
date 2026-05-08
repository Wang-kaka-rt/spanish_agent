import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function Panel({ title, description, children, className }: Props) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}
