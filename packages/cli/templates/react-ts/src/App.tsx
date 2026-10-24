import { useState, useEffect } from 'react'
import { geolocation } from '@capsule/core'

export default function App() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    geolocation
      .getCurrentPosition()
      .then((p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }))
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Capsule App</h1>
      {position && (
        <p>
          📍 {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
        </p>
      )}
      {error && <p style={{ color: 'orange' }}>⚠ {error}</p>}
      {!position && !error && <p>Getting location...</p>}
    </div>
  )
}
