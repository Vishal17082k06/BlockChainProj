import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { NetworkId } from '../lib/types'

// Local blocks arrive instantly and cost nothing to poll; Sepolia has a block about every 12 seconds
// and a free public server, so it is polled gently.
const PULSE_INTERVAL_MS: Record<NetworkId, number> = { local: 3000, sepolia: 12000 }

export function useNetworks() {
  return useQuery({
    queryKey: ['networks'],
    queryFn: api.networks,
    staleTime: 15_000,
    retry: false,
  })
}

export function usePulse(net: NetworkId, enabled: boolean) {
  return useQuery({
    queryKey: ['pulse', net],
    queryFn: () => api.pulse(net),
    enabled,
    refetchInterval: PULSE_INTERVAL_MS[net],
    retry: false,
  })
}

export function useRecords(net: NetworkId, enabled: boolean) {
  return useQuery({
    queryKey: ['records', net],
    queryFn: () => api.records(net),
    enabled,
    retry: false,
  })
}

export function useRecord(net: NetworkId, id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['record', net, id],
    queryFn: () => api.record(net, id as number),
    enabled: enabled && id !== null,
    retry: false,
  })
}
