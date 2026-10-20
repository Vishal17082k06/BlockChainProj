import { useCallback, useReducer, useRef, useState } from 'react'
import { ActivityTape } from './components/ActivityTape'
import { Header } from './components/Header'
import { NetworkStrip } from './components/NetworkStrip'
import { useNetworks } from './hooks/queries'
import { activityReducer, type ActivityInput } from './lib/activity'
import type { NetworkId } from './lib/types'
import { Workspace } from './Workspace'
import styles from './App.module.css'

const NETWORK_KEY = 'witness.network'

function savedNetwork(): NetworkId {
  try {
    return localStorage.getItem(NETWORK_KEY) === 'sepolia' ? 'sepolia' : 'local'
  } catch {
    return 'local'
  }
}

/** The frame: header, network banner and the activity tape. The activity tape keeps its history across
 *  networks (each line says which one it happened on); everything else lives in the Workspace. */
export default function App() {
  const [network, setNetwork] = useState<NetworkId>(savedNetwork)
  const [tapeOpen, setTapeOpen] = useState(false)
  const [activity, dispatch] = useReducer(activityReducer, [])
  const nextActivityId = useRef(1)

  const record = useCallback((input: ActivityInput) => {
    dispatch({ type: 'push', input, at: Math.floor(Date.now() / 1000), id: nextActivityId.current++ })
  }, [])

  const networks = useNetworks()
  const info = networks.data?.find((n) => n.id === network)

  const changeNetwork = (id: NetworkId) => {
    if (id === network) return
    setNetwork(id)
    try {
      localStorage.setItem(NETWORK_KEY, id)
    } catch {
      // The choice simply is not remembered; the console still works.
    }
  }

  return (
    <div className={styles.app}>
      <Header networks={networks.data} loading={networks.isLoading} value={network} onChange={changeNetwork} />
      <NetworkStrip network={info} />
      <main className={styles.main}>
        <Workspace key={network} network={network} info={info} networksQuery={networks} record={record} />
      </main>
      <ActivityTape
        items={activity}
        expanded={tapeOpen}
        onToggle={() => setTapeOpen((open) => !open)}
        onClear={() => dispatch({ type: 'clear' })}
      />
    </div>
  )
}
