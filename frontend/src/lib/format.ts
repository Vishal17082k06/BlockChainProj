const DASH = '—'

export function timeAgo(unixSeconds: number | null, nowMs: number = Date.now()): string {
  if (unixSeconds === null) return DASH
  const seconds = Math.floor(nowMs / 1000 - unixSeconds)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds} s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return `${Math.floor(seconds / 86400)} d ago`
}

const grouped = new Intl.NumberFormat('en-US')

export function formatBlock(block: number | null): string {
  return block === null ? DASH : grouped.format(block)
}

export function formatGas(gas: number | null): string {
  return gas === null ? DASH : grouped.format(gas)
}

/** "0.000084331000" -> "0.000084331", "0.050000" -> "0.05", "0.000000000" -> "0". */
export function formatEth(eth: string | null): string {
  if (eth === null) return DASH
  if (!eth.includes('.')) return eth
  const trimmed = eth.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '' ? '0' : trimmed
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes} min ${seconds} s`
}

export function shortHash(hash: string, head = 6, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`
}
