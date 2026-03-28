import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddressLinkProps {
  address: string
  googleMapsUrl?: string | null
  className?: string
}

export function AddressLink({ address, googleMapsUrl, className }: AddressLinkProps) {
  // Only link if we have a reliable Maps URL — don't generate one from just a name
  if (!googleMapsUrl) {
    return (
      <span className={cn('inline-flex items-center gap-1', className)}>
        <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        {address}
      </span>
    )
  }

  return (
    <a
      href={googleMapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-primary hover:underline',
        className
      )}
    >
      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
      {address}
    </a>
  )
}
