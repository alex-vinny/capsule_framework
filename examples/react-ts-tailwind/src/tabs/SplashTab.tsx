import { useState, useRef, useCallback } from 'react'

type RunState = 'idle' | 'running' | 'done'

const DURATIONS = [1, 2, 3, 5] as const
type Duration = (typeof DURATIONS)[number]

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export default function SplashTab() {
  const [duration, setDuration] = useState<Duration>(3)
  const [state, setState] = useState<RunState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const cancelledRef = useRef(false)

  const run = useCallback(async () => {
    cancelledRef.current = false
    setState('running')
    setElapsed(0)
    setCountdown(duration)

    const t0 = Date.now()

    // tick the countdown every 100 ms
    const interval = setInterval(() => {
      if (cancelledRef.current) {
        clearInterval(interval)
        return
      }
      const remaining = Math.max(0, duration - (Date.now() - t0) / 1000)
      setCountdown(remaining)
    }, 100)

    await sleep(duration * 1000)
    clearInterval(interval)

    if (!cancelledRef.current) {
      setElapsed(Date.now() - t0)
      setCountdown(0)
      setState('done')
    }
  }, [duration])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    setState('idle')
    setCountdown(0)
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setElapsed(0)
    setCountdown(0)
  }, [])

  return (
    <div className="flex flex-col gap-5 p-5 max-w-lg mx-auto">
      {/* Config */}
      <section className="bg-white rounded-xl p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Splash Simulation
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Simulates a slow background task (e.g. server startup) behind a blocking overlay — the
          same pattern Capsule uses to hold the WebView until NanoHTTPD is ready.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-gray-500 shrink-0">Duration</span>
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                disabled={state === 'running'}
                onClick={() => setDuration(d)}
                className={`w-10 h-8 rounded-lg text-xs border transition-colors disabled:opacity-40 ${
                  duration === d
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            disabled={state === 'running'}
            onClick={state === 'done' ? reset : run}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-40"
          >
            {state === 'done' ? 'Run again' : 'Start'}
          </button>
        </div>
      </section>

      {/* Full-screen splash overlay — covers the whole viewport like the native splash does */}
      {state === 'running' && (
        <div
          className="fixed inset-0 bg-white flex flex-col items-center justify-center gap-4"
          style={{ zIndex: 9999 }}
        >
          <Spinner />
          <p className="text-2xl font-light tabular-nums text-gray-800">{countdown.toFixed(1)}s</p>
          <p className="text-xs text-gray-400">Simulating server startup…</p>
          <button
            onClick={cancel}
            className="mt-4 px-5 py-2 rounded-lg border border-red-200 bg-red-50 text-red-500 text-xs font-medium hover:bg-red-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {state === 'done' && (
        <section className="bg-white rounded-xl p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Result
          </h2>
          <div className="divide-y divide-gray-100">
            <Row label="Requested" value={`${duration} s`} />
            <Row label="Actual elapsed" value={`${elapsed} ms`} />
            <Row label="Overhead" value={`${elapsed - duration * 1000} ms`} />
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            Splash hid after the simulated task completed — same lifecycle as NanoHTTPD server
            start.
          </p>
        </section>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className="font-medium text-xs">{value}</span>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#e5e7eb" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
