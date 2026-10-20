import type { FailureCode, StageEvent, WriteKind } from './types'

export type StepId = 'saved' | 'fingerprint' | 'sent' | 'mined' | 'removed'
export type StepStatus = 'pending' | 'active' | 'done' | 'failed'

export interface Step {
  id: StepId
  status: StepStatus
}

export interface RunState {
  phase: 'idle' | 'running' | 'done' | 'failed'
  kind: WriteKind | null
  steps: Step[]
  noteId: number | null
  fingerprint: string | null
  txHash: string | null
  explorerUrl: string | null
  block: number | null
  gasUsed: number | null
  feeEth: string | null
  version: number | null
  elapsedMs: number
  failure: { code: FailureCode; message: string } | null
}

export type RunAction =
  | { type: 'start'; kind: WriteKind }
  | { type: 'event'; event: StageEvent }
  | { type: 'reset' }

export const initialRun: RunState = {
  phase: 'idle',
  kind: null,
  steps: [],
  noteId: null,
  fingerprint: null,
  txHash: null,
  explorerUrl: null,
  block: null,
  gasUsed: null,
  feeEth: null,
  version: null,
  elapsedMs: 0,
  failure: null,
}

/** The real stages of each kind of write, in the order the API reports them. */
export function stepsFor(kind: WriteKind): StepId[] {
  switch (kind) {
    case 'create':
      return ['saved', 'fingerprint', 'sent', 'mined']
    case 'edit':
      return ['fingerprint', 'sent', 'mined']
    case 'delete':
      return ['sent', 'mined', 'removed']
  }
}

function advanceTo(steps: Step[], id: StepId): Step[] {
  const index = steps.findIndex((s) => s.id === id)
  if (index < 0) return steps
  return steps.map((step, i): Step => {
    if (i <= index) return { id: step.id, status: 'done' }
    if (i === index + 1) return { id: step.id, status: 'active' }
    return step
  })
}

export function runReducer(state: RunState, action: RunAction): RunState {
  if (action.type === 'reset') return initialRun
  if (action.type === 'start') {
    const ids = stepsFor(action.kind)
    return {
      ...initialRun,
      phase: 'running',
      kind: action.kind,
      steps: ids.map((id, i): Step => ({ id, status: i === 0 ? 'active' : 'pending' })),
    }
  }

  const event = action.event
  if (state.phase !== 'running') return state
  const next: RunState = { ...state, elapsedMs: event.t }

  switch (event.stage) {
    case 'saved':
      return { ...next, noteId: event.noteId, steps: advanceTo(state.steps, 'saved') }
    case 'fingerprint':
      return { ...next, fingerprint: event.hash, steps: advanceTo(state.steps, 'fingerprint') }
    case 'sent':
      return { ...next, txHash: event.txHash, explorerUrl: event.explorerUrl, steps: advanceTo(state.steps, 'sent') }
    case 'mined':
      return {
        ...next,
        block: event.block,
        gasUsed: event.gasUsed,
        feeEth: event.feeEth,
        version: event.version ?? null,
        steps: advanceTo(state.steps, 'mined'),
      }
    case 'removed':
      return { ...next, steps: advanceTo(state.steps, 'removed') }
    case 'done':
      return {
        ...next,
        phase: 'done',
        noteId: event.noteId,
        steps: state.steps.map((s): Step => ({ id: s.id, status: 'done' })),
      }
    case 'failed':
      return {
        ...next,
        phase: 'failed',
        failure: { code: event.code, message: event.message },
        steps: state.steps.map((s): Step => (s.status === 'active' ? { id: s.id, status: 'failed' } : s)),
      }
    default:
      return state
  }
}
