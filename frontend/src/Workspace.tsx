import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { AttackLab } from './components/AttackLab'
import { Composer } from './components/Composer'
import { ErrorNotice } from './components/ErrorNotice'
import { Inspector } from './components/Inspector'
import { Ledger } from './components/Ledger'
import { StageStepper } from './components/StageStepper'
import { SummaryBar } from './components/SummaryBar'
import { useRecord, useRecords } from './hooks/queries'
import { useVerifyAll } from './hooks/useVerifyAll'
import { useWrite } from './hooks/useWrite'
import type { ActivityInput } from './lib/activity'
import { api } from './lib/api'
import { cx } from './lib/cx'
import type { AttackKind, AttackResult, NetworkId, NetworkInfo } from './lib/types'
import styles from './App.module.css'

interface Props {
  network: NetworkId
  info: NetworkInfo | undefined
  networksQuery: Pick<UseQueryResult<NetworkInfo[]>, 'isError' | 'error' | 'data' | 'refetch'>
  record: (line: ActivityInput) => void
}

/** Everything that belongs to ONE network: its notes, the open write, the last check, the selection.
 *  App renders it with `key={network}`, so switching networks starts it fresh and nothing from
 *  Local can be mistaken for Sepolia. */
export function Workspace({ network, info, networksQuery, record }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [attackOpen, setAttackOpen] = useState(false)
  const inspectorBox = useRef<HTMLElement>(null)
  const queryClient = useQueryClient()

  const ready = info?.ready ?? false
  // The ledger does not wait for the (slower) network check: it starts at once and is only held back
  // when the check says this network cannot be used.
  const usable = info?.ready ?? true
  const label = info?.label ?? (network === 'sepolia' ? 'Sepolia' : 'Local')

  const records = useRecords(network, usable)
  const detail = useRecord(network, selectedId, usable)
  const write = useWrite(network, record)
  const verify = useVerifyAll(network, record)

  // A newly anchored note is the thing the person wants to look at next.
  const lastSelected = useRef<number | null>(null)
  useEffect(() => {
    const { phase, kind, noteId } = write.run
    if (phase !== 'done' || kind !== 'create' || noteId === null) return
    if (lastSelected.current === noteId) return
    lastSelected.current = noteId
    setSelectedId(noteId)
  }, [write.run])

  // If the selected note disappears from the ledger altogether, there is nothing left to inspect.
  useEffect(() => {
    if (selectedId === null || !records.data) return
    if (!records.data.records.some((r) => r.id === selectedId)) setSelectedId(null)
  }, [records.data, selectedId])

  // Each note starts at the top of the inspector, not wherever the last one was scrolled to.
  useEffect(() => {
    inspectorBox.current?.scrollTo({ top: 0 })
  }, [selectedId])

  const select = (id: number) => {
    setSelectedId(id)
    setInspectorOpen(true)
  }

  const runAttack = async (
    kind: AttackKind,
    options: { content?: string; coverTracks: boolean },
  ): Promise<AttackResult> => {
    if (selectedId === null) return { ok: false, detail: 'Select a note first.' }
    if (write.busy) return { ok: false, detail: 'A write is still running. Wait for it to finish.' }
    try {
      const result = await api.attack(network, kind, { id: selectedId, ...options })
      record({ tag: 'ATTACK', text: result.detail, tone: 'attack', network })
      await queryClient.invalidateQueries({ queryKey: ['records', network] })
      await queryClient.invalidateQueries({ queryKey: ['record', network] })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The attack could not run.'
      record({ tag: 'FAILED', text: message, tone: 'bad', network })
      return { ok: false, detail: message }
    }
  }

  const selectedRow = records.data?.records.find((r) => r.id === selectedId)
  const currentText = detail.data ? (detail.data.row?.content ?? null) : (selectedRow?.content ?? null)

  if (networksQuery.isError) {
    return (
      <ErrorNotice
        title="Could not reach the Witness API"
        message={(networksQuery.error as Error).message}
        onRetry={() => networksQuery.refetch()}
      />
    )
  }
  if (networksQuery.data && !ready) {
    return (
      <ErrorNotice
        title={`${label} is not available`}
        message={info?.reason ?? 'This network cannot be used right now.'}
        onRetry={() => networksQuery.refetch()}
      />
    )
  }

  return (
    <>
      <div className={styles.columns}>
        <section className={styles.ledgerColumn} aria-label="Ledger">
          <Composer
            disabled={write.busy}
            networkLabel={label}
            onSubmit={async (text) => (await write.start({ kind: 'create', content: text })) === 'done'}
          />
          <StageStepper run={write.run} network={label} onDismiss={write.dismiss} />
          <SummaryBar
            summary={records.data?.summary ?? {}}
            checking={verify.checking}
            checkedAt={verify.checkedAt}
            checkMs={verify.checkMs}
            disabled={!usable || write.busy}
            onVerifyAll={verify.verify}
          />
          <Ledger
            records={records.data?.records}
            loading={records.isLoading}
            error={records.error as Error | null}
            onRetry={() => records.refetch()}
            selectedId={selectedId}
            onSelect={select}
            networkLabel={label}
          />
        </section>

        <aside
          ref={inspectorBox}
          className={cx(styles.inspector, inspectorOpen && styles.inspectorOpen)}
          aria-label="Inspector"
        >
          <Inspector
            selectedId={selectedId}
            record={selectedRow}
            detail={detail.data}
            loading={detail.isLoading}
            error={detail.error as Error | null}
            onRetry={() => detail.refetch()}
            busy={write.busy}
            onEdit={async (text) =>
              selectedId !== null && (await write.start({ kind: 'edit', id: selectedId, content: text })) === 'done'
            }
            onDelete={async () => selectedId !== null && (await write.start({ kind: 'delete', id: selectedId })) === 'done'}
            onOpenAttack={() => setAttackOpen(true)}
            onClose={() => setInspectorOpen(false)}
          />
        </aside>
      </div>

      <AttackLab
        open={attackOpen}
        onClose={() => setAttackOpen(false)}
        noteId={selectedId}
        currentText={currentText}
        networkLabel={label}
        onRun={runAttack}
        onVerify={() => {
          setAttackOpen(false)
          void verify.verify()
        }}
      />
    </>
  )
}
