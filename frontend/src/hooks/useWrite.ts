import { useCallback, useReducer, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, writeStream } from '../lib/api'
import { fromStage, type ActivityInput } from '../lib/activity'
import { initialRun, runReducer } from '../lib/stageReducer'
import type { NetworkId, StageEvent, WriteOp } from '../lib/types'

export type WriteOutcome = 'done' | 'failed' | 'busy'

/** Runs one write at a time against a network and turns the API's real stage stream into UI state.
 *  `record` receives a line for the activity tape for every stage that happens. */
export function useWrite(net: NetworkId, record: (line: ActivityInput) => void) {
  const [run, dispatch] = useReducer(runReducer, initialRun)
  const queryClient = useQueryClient()
  const running = useRef(false)

  const start = useCallback(
    async (op: WriteOp): Promise<WriteOutcome> => {
      if (running.current) return 'busy'
      running.current = true
      dispatch({ type: 'start', kind: op.kind, noteId: op.kind === 'create' ? undefined : op.id })

      let outcome: WriteOutcome = 'failed'
      const apply = (event: StageEvent) => {
        dispatch({ type: 'event', event })
        const line = fromStage(event, net)
        if (line) record(line)
      }

      try {
        for await (const event of writeStream(net, op)) {
          apply(event)
          if (event.stage === 'done') outcome = 'done'
        }
      } catch (error) {
        // A refusal thrown before the first event (busy, invalid, API unreachable) becomes a failed run,
        // so every kind of failure is shown in the same place and the same way.
        const known = error instanceof ApiError ? error : null
        apply({
          t: 0,
          stage: 'failed',
          code: known?.code === 'BUSY' ? 'BUSY' : known?.code === 'INVALID' ? 'INVALID' : 'CHAIN_UNAVAILABLE',
          message: known?.message ?? 'Something unexpected went wrong.',
        })
      } finally {
        running.current = false
        await queryClient.invalidateQueries({ queryKey: ['records', net] })
        await queryClient.invalidateQueries({ queryKey: ['record', net] })
      }
      return outcome
    },
    [net, record, queryClient],
  )

  const dismiss = useCallback(() => dispatch({ type: 'reset' }), [])

  return { run, start, dismiss, busy: run.phase === 'running' }
}
