import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      {icon && (
        <div className="mb-4 text-muted-foreground/50">
          {icon}
        </div>
      )}
      <p className="text-muted-foreground mb-1 text-lg font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground/70 mb-4 text-sm">{description}</p>
      )}
      {!description && action && <div className="mt-3" />}
      {action}
    </div>
  )
}
