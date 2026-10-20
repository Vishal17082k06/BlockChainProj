import { chunk, diffHex } from './diffHex'

// The 10:00 and 10:30 appointment fingerprints from the demo (Step 02's avalanche example).
const A = '5c441319a657dd15db999f6f427ba1685edacceb6d13a2700b1baee881bef979'
const B = 'aced92d4f85fe7e1bd2f45da62070ebfd4d520f0a17459632c1cb40d3f090ab1'

function countDifferences(x: string, y: string): number {
  let n = 0
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) n++
  return n
}

describe('diffHex', () => {
  it('reports identical fingerprints as identical, with nothing marked', () => {
    const d = diffHex(A, A)
    expect(d.identical).toBe(true)
    expect(d.comparable).toBe(true)
    expect(d.differing).toBe(0)
    expect(d.total).toBe(64)
    expect(d.chain.every((cell) => !cell.differs)).toBe(true)
    expect(d.database.every((cell) => !cell.differs)).toBe(true)
  })

  it('marks exactly the positions that differ, on both rows', () => {
    const d = diffHex(A, B)
    expect(d.identical).toBe(false)
    expect(d.differing).toBe(countDifferences(A, B))
    expect(d.chain.filter((c) => c.differs).length).toBe(d.differing)
    expect(d.database.filter((c) => c.differs).length).toBe(d.differing)
    d.chain.forEach((cell, i) => expect(cell.differs).toBe(A[i] !== B[i]))
  })

  it('shows the avalanche effect: unrelated-looking fingerprints differ almost everywhere', () => {
    expect(diffHex(A, B).differing).toBeGreaterThan(50)
  })

  it('changing one character marks exactly one cell', () => {
    const changed = A.slice(0, 10) + (A[10] === '0' ? '1' : '0') + A.slice(11)
    const d = diffHex(A, changed)
    expect(d.differing).toBe(1)
    expect(d.chain[10].differs).toBe(true)
  })

  it('ignores a 0x prefix and letter case', () => {
    expect(diffHex('0x' + A.toUpperCase(), A).identical).toBe(true)
  })

  it('keeps each character so it can be drawn', () => {
    const d = diffHex(A, B)
    expect(d.chain.map((c) => c.c).join('')).toBe(A)
    expect(d.database.map((c) => c.c).join('')).toBe(B)
  })

  it('cannot compare when one side is missing, and says so', () => {
    const noDb = diffHex(A, null)
    expect(noDb.comparable).toBe(false)
    expect(noDb.identical).toBe(false)
    expect(noDb.database).toEqual([])
    expect(noDb.chain).toHaveLength(64)
    const noChain = diffHex(null, B)
    expect(noChain.comparable).toBe(false)
    expect(noChain.chain).toEqual([])
    const neither = diffHex(null, null)
    expect(neither.comparable).toBe(false)
    expect(neither.identical).toBe(false)
  })

  it('does not throw on different lengths and flags the extra characters', () => {
    const d = diffHex(A, A.slice(0, 60))
    expect(d.total).toBe(64)
    expect(d.identical).toBe(false)
    expect(d.differing).toBe(4)
  })
})

describe('chunk', () => {
  it('splits 64 cells into 8 groups of 8', () => {
    const groups = chunk(diffHex(A, B).chain, 8)
    expect(groups).toHaveLength(8)
    expect(groups.every((g) => g.length === 8)).toBe(true)
  })

  it('keeps a shorter final group', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
