import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useVerifyAll } from './useVerifyAll'
import { api, ApiError } from '../lib/api'
import type { ActivityInput } from '../lib/activity'
import type { RecordRow } from '../lib/types'

vi.mock('../lib/api', async (original) => {
  const actual = await original<typeof import('../lib/api')>()
  return { ...actual, api: { ...actual.api, verifyAll: vi.fn() } }
})

const verifyAll = vi.mocked(api.verifyAll)

const rows: RecordRow[] = [
  { id: 1, content: 'a', status: 'VERIFIED', version: 1, anchoredAt: 10, inDatabase: true },
  { id: 2, content: 'b', status: 'TAMPERED', version: 1, anchoredAt: 11, inDatabase: true },
]

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const lines: ActivityInput[] = []
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useVerifyAll('local', (line) => lines.push(line)), { wrapper })
  return { ...hook, client, lines }
}

describe('useVerifyAll', () => {
  it('puts the fresh results straight into the ledger and notes the outcome', async () => {
    verifyAll.mockResolvedValue({ summary: { VERIFIED: 1, TAMPERED: 1 }, results: rows })
    const { result, client, lines } = setup()
    await act(async () => {
      await result.current.verify()
    })
    expect(client.getQueryData(['records', 'local'])).toEqual({ summary: { VERIFIED: 1, TAMPERED: 1 }, records: rows })
    expect(result.current.checkedAt).not.toBeNull()
    expect(result.current.checkMs).not.toBeNull()
    expect(result.current.error).toBeNull()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ tag: 'VERIFY', tone: 'bad', network: 'local' })
    expect(lines[0].text).toContain('1 tampered')
  })

  it('reads as ok when every note checks out', async () => {
    verifyAll.mockResolvedValue({ summary: { VERIFIED: 2 }, results: [rows[0], { ...rows[0], id: 3 }] })
    const { result, lines } = setup()
    await act(async () => {
      await result.current.verify()
    })
    expect(lines[0]).toMatchObject({ tag: 'VERIFY', tone: 'ok' })
  })

  it('keeps the old ledger and reports the error when the check fails', async () => {
    verifyAll.mockRejectedValue(new ApiError(503, 'UNAVAILABLE', 'Chain is down'))
    const { result, client, lines } = setup()
    client.setQueryData(['records', 'local'], { summary: {}, records: rows })
    await act(async () => {
      await result.current.verify()
    })
    expect(result.current.error?.message).toBe('Chain is down')
    expect(result.current.checking).toBe(false)
    expect(client.getQueryData(['records', 'local'])).toEqual({ summary: {}, records: rows })
    expect(lines[0]).toMatchObject({ tag: 'FAILED', tone: 'bad' })
  })

  it('ignores a second click while a check is running', async () => {
    let finish: (v: Awaited<ReturnType<typeof api.verifyAll>>) => void = () => {}
    verifyAll.mockClear()
    verifyAll.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { result } = setup()
    let first: Promise<void> | undefined
    act(() => {
      first = result.current.verify()
    })
    await act(async () => {
      await result.current.verify()
    })
    expect(verifyAll).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ summary: { VERIFIED: 1 }, results: [rows[0]] })
      await first
    })
  })
})
