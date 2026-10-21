import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ActivityInput } from '../lib/activity'
import { statusMeta, STATUS_ORDER } from '../lib/statusMeta'
import type { NetworkId, StatusSummary } from '../lib/types'

function describe(summary: StatusSummary): { text: string; tone: ActivityInput['tone'] } {
  const present = STATUS_ORDER.filter((s) => (summary[s] ?? 0) > 0)
  const total = present.reduce((sum, s) => sum + (summary[s] ?? 0), 0)
  const trouble = present.filter((s) => s !== 'VERIFIED' && s !== 'DELETED_AUTHORIZED')
  if (total === 0) return { text: 'Checked: there are no notes yet', tone: 'neutral' }
  if (trouble.length === 0) return { text: `Checked ${total} notes against the chain: all in order`, tone: 'ok' }
  const parts = trouble.map((s) => `${summary[s]} ${statusMeta[s].label.toLowerCase()}`)
  return { text: `Checked ${total} notes against the chain: ${parts.join(', ')}`, tone: 'bad' }
}

/** Re-checks every note against the chain. The answer replaces the ledger directly, so the page
 *  does not need a second request to show it. */
export function useVerifyAll(net: NetworkId, record: (line: ActivityInput) => void) {
  const queryClient = useQueryClient()
  const running = useRef(false)
  const [checking, setChecking] = useState(false)
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const [checkMs, setCheckMs] = useState<number | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const verify = useCallback(async () => {
    if (running.current) return
    running.current = true
    setChecking(true)
    setError(null)
    const started = performance.now()
    try {
      const { summary, results } = await api.verifyAll(net)
      queryClient.setQueryData(['records', net], { summary, records: results })
      await queryClient.invalidateQueries({ queryKey: ['record', net] })
      setCheckedAt(Math.floor(Date.now() / 1000))
      setCheckMs(Math.round(performance.now() - started))
      const { text, tone } = describe(summary)
      record({ tag: 'VERIFY', text, tone, network: net })
    } catch (caught) {
      const failure = caught instanceof Error ? caught : new Error('The check failed.')
      setError(failure)
      record({ tag: 'FAILED', text: failure.message, tone: 'bad', network: net })
    } finally {
      running.current = false
      setChecking(false)
    }
  }, [net, record, queryClient])

  return { verify, checking, checkedAt, checkMs, error }
}
