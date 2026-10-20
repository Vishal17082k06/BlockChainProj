import { parseNdjson } from './ndjson'
import type {
  AttackKind,
  AttackRequest,
  AttackResult,
  NetworkId,
  NetworkInfo,
  RecordDetail,
  RecordRow,
  RecordsResponse,
  StageEvent,
  StatusSummary,
  WriteOp,
} from './types'

export type ApiErrorCode = 'BUSY' | 'INVALID' | 'NOT_FOUND' | 'UNAVAILABLE' | 'HTTP'

export class ApiError extends Error {
  status: number
  code: ApiErrorCode

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const UNREACHABLE = 'Could not reach the Witness API. Start it with run_ui.py (see docs/how-to-run.md).'

async function failFrom(response: Response): Promise<never> {
  let detail = ''
  try {
    const body = await response.json()
    if (typeof body?.detail === 'string') detail = body.detail
  } catch {
    // no readable body: fall back to a generic message below
  }
  const code: ApiErrorCode =
    response.status === 409 ? 'BUSY'
    : response.status === 422 ? 'INVALID'
    : response.status === 404 ? 'NOT_FOUND'
    : response.status === 503 ? 'UNAVAILABLE'
    : 'HTTP'
  const message =
    code === 'INVALID'
      ? 'That note is empty or too long. Use 1 to 500 characters.'
      : detail || `The request failed (HTTP ${response.status}).`
  throw new ApiError(response.status, code, message)
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'UNAVAILABLE', UNREACHABLE)
  }
  if (!response.ok) await failFrom(response)
  return response
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>
}

const JSON_HEADERS = { 'content-type': 'application/json' }

export const api = {
  networks: () => getJson<NetworkInfo[]>('/api/networks'),
  records: (net: NetworkId) => getJson<RecordsResponse>(`/api/${net}/records`),
  record: (net: NetworkId, id: number) => getJson<RecordDetail>(`/api/${net}/records/${id}`),
  verifyAll: (net: NetworkId) =>
    getJson<{ summary: StatusSummary; results: RecordRow[] }>(`/api/${net}/verify-all`, { method: 'POST' }),
  attack: (net: NetworkId, kind: AttackKind, body: AttackRequest) =>
    getJson<AttackResult>(`/api/${net}/attack/${kind}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    }),
}

/** Performs a write and yields each real stage as the API reports it. Rejects before the first
 *  event for a refusal (busy, invalid, unavailable). */
export async function* writeStream(net: NetworkId, op: WriteOp): AsyncGenerator<StageEvent> {
  let init: RequestInit
  let path = `/api/${net}/notes`
  if (op.kind === 'create') {
    init = { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ content: op.content }) }
  } else if (op.kind === 'edit') {
    path += `/${op.id}`
    init = { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ content: op.content }) }
  } else {
    path += `/${op.id}`
    init = { method: 'DELETE' }
  }
  const response = await send(path, init)
  if (!response.body) throw new ApiError(response.status, 'HTTP', 'The server sent an empty response.')
  yield* parseNdjson(response.body)
}
