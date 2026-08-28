import { useId, type ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  tone?: 'default' | 'danger'
  side?: boolean
  className?: string
  bodyClassName?: string
}

/** 统一弹窗表面：论文卡片式标题、细网格底纹和一致的关闭/操作区域。 */
export default function PaperDialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md',
  tone = 'default',
  side = false,
  className = '',
  bodyClassName = ''
}: Props) {
  const titleId = useId()
  return <div className={`overlay paper-overlay ${side ? '' : 'center'}`} onClick={onClose}>
    <section
      className={`paper-dialog paper-dialog-${size} ${side ? 'paper-dialog-side' : ''} ${tone === 'danger' ? 'danger' : ''} ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="paper-dialog-header">
        <span className="paper-dialog-mark" aria-hidden="true"><i /><i /><i /></span>
        <div className="paper-dialog-heading">
          <b id={titleId}>{title}</b>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <button className="paper-dialog-close" aria-label={`关闭${title}`} onClick={onClose}>×</button>
      </header>
      <div className={`paper-dialog-body ${bodyClassName}`}>{children}</div>
      {footer && <footer className="paper-dialog-footer">{footer}</footer>}
    </section>
  </div>
}
