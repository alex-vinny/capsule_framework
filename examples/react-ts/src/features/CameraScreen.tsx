import { useState } from 'react'
import { camera } from '@capsule/core'
import type { CameraPhoto } from '@capsule/core'
import { Button, ErrorNote, Note, Row } from '../ui'

export default function CameraScreen() {
  const [photo, setPhoto] = useState<CameraPhoto | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<CameraPhoto>) => {
    setError(null)
    fn()
      .then(setPhoto)
      .catch((e: Error) => setError(e.message))
  }

  return (
    <>
      <Row>
        <Button
          onClick={() => run(() => camera.capturePhoto({ result: 'dataUrl', maxWidth: 1024 }))}
        >
          Capture
        </Button>
        <Button onClick={() => run(() => camera.pickImage({ result: 'dataUrl', maxWidth: 1024 }))}>
          Pick
        </Button>
      </Row>

      {error && <ErrorNote>{error}</ErrorNote>}

      {photo && (
        <div style={{ marginTop: 8 }}>
          <Note>
            {photo.format} · {photo.width}×{photo.height} · {Math.round(photo.size / 1024)} KB
          </Note>
          <img
            src={photo.webPath}
            alt="captured"
            style={{ maxWidth: '100%', borderRadius: 6, marginTop: 4 }}
          />
        </div>
      )}
    </>
  )
}
