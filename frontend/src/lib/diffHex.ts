// The engine behind the Seal check: a character-by-character comparison of two fingerprints.

export interface Cell {
  c: string
  differs: boolean
}

export interface HexDiff {
  /** The fingerprint the chain holds, one cell per character. Empty if the chain has none. */
  chain: Cell[]
  /** The fingerprint computed from the database row now. Empty if there is no row. */
  database: Cell[]
  differing: number
  total: number
  identical: boolean
  /** False when one side is missing, so a character comparison would mean nothing. */
  comparable: boolean
}

function normalise(hex: string | null): string | null {
  return hex === null ? null : hex.replace(/^0x/i, '').toLowerCase()
}

function plain(hex: string | null): Cell[] {
  return hex === null ? [] : [...hex].map((c) => ({ c, differs: false }))
}

export function diffHex(chain: string | null, database: string | null): HexDiff {
  const a = normalise(chain)
  const b = normalise(database)

  if (a === null || b === null) {
    const total = (a ?? b ?? '').length
    return { chain: plain(a), database: plain(b), differing: total, total, identical: false, comparable: false }
  }

  const total = Math.max(a.length, b.length)
  const chainCells: Cell[] = []
  const databaseCells: Cell[] = []
  let differing = 0
  for (let i = 0; i < total; i++) {
    const x = a[i]
    const y = b[i]
    const differs = x !== y
    if (differs) differing++
    if (x !== undefined) chainCells.push({ c: x, differs })
    if (y !== undefined) databaseCells.push({ c: y, differs })
  }
  return { chain: chainCells, database: databaseCells, differing, total, identical: total > 0 && differing === 0, comparable: true }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
  return groups
}
