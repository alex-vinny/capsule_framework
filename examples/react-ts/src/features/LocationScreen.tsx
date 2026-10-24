import { useEffect, useState } from 'react'
import { geolocation } from '@capsule/core'
import { ErrorNote, Note } from '../ui'

export default function LocationScreen() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetch = () => {
      geolocation
        .getCurrentPosition()
        .then((p) => {
          if (!cancelled) setPosition({ lat: p.coords.latitude, lng: p.coords.longitude })
        })
        .catch((e) => {
          if (cancelled) return
          // The native permission prompt resolves async — retry briefly until granted.
          if (e.message === 'PERMISSION_DENIED') {
            setTimeout(() => {
              if (!cancelled) fetch()
            }, 500)
          } else {
            setError(e.message)
          }
        })
    }
    fetch()
    return () => {
      cancelled = true
    }
  }, [])

  if (position)
    return (
      <p style={{ fontSize: 14 }}>
        {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
      </p>
    )
  if (error) return <ErrorNote>{error}</ErrorNote>
  return <Note>Getting location…</Note>
}
