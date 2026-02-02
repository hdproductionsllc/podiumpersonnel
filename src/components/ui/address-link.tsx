import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddressLinkProps {
  address: string
  googleMapsUrl?: string | null
  className?: string
}

export function AddressLink({ address, googleMapsUrl, className }: AddressLinkProps) {
  const href =
    googleMapsUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

  return (
    <a
      href={href}
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
