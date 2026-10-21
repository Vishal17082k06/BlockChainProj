import { useEffect, useRef, useState } from 'react'

/** While `running`, ticks every 100 ms from zero; once it stops, returns the settled value. */
export function useLiveElapsed(running: boolean, settledMs: number): number {
  const [now, setNow] = useState(0)
  const startedAt = useRef(0)

  useEffect(() => {
    if (!running) return
    startedAt.current = performance.now()
    setNow(0)
    const id = window.setInterval(() => setNow(performance.now() - startedAt.current), 100)
    return () => window.clearInterval(id)
  }, [running])

  return running ? now : settledMs
}
