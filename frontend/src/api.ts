// Thin client for the FastAPI backend. Types mirror backend/app/schemas.py.

export type Role = 'admin' | 'member'
export type RobotStatus = 'available' | 'maintenance' | 'defect' | 'retired'
export type Availability = RobotStatus | 'reserved'
export type TicketKind = 'maintenance' | 'fault'
export type TicketStatus = 'open' | 'in_progress' | 'resolved'
export type ExperimentResult = 'success' | 'partial' | 'failure'

export interface UserBrief {
  id: number
  username: string
  display_name: string
}

export interface User extends UserBrief {
  email: string | null
  role: Role
  auth_source: 'local' | 'ldap' | 'oidc'
  language: 'de' | 'en'
  is_active: boolean
}

export interface Robot {
  id: number
  name: string
  type: string
  location: string
  responsible_user: UserBrief | null
  documentation_url: string | null
  description: string | null
  status: RobotStatus
  availability: Availability
  current_reservation_id: number | null
  open_tickets: number
  live: LiveStatus | null
  has_api_key: boolean
  created_at: string
}

export interface LiveStatus {
  online: boolean
  state: string | null
  message: string | null
  battery: number | null
  last_seen_at: string | null
}

export interface AuthConfig {
  ldap: boolean
  oidc: boolean
  oidc_label: string
}

export interface RobotStats {
  robot_id: number
  name: string
  reserved_hours: number
  reservations: number
  utilization: number
  tickets_opened: number
  mean_time_to_resolve_hours: number | null
  experiments: number
  experiment_success_rate: number | null
}

export interface Stats {
  range: { start: string; end: string; days: number; lab_hours: number }
  totals: {
    reservations: number
    reserved_hours: number
    tickets_opened: number
    faults_opened: number
    mean_time_to_resolve_hours: number | null
    experiments: number
    experiment_success_rate: number | null
  }
  robots: RobotStats[]
  top_users: { user_id: number; display_name: string; reserved_hours: number; reservations: number }[]
  daily: { date: string; hours: number }[]
  /** [weekday Mon=0][hour 0-23] -> booked hours */
  heatmap: number[][]
}

export interface Reservation {
  id: number
  robot_id: number
  robot_name: string
  user: UserBrief
  start: string
  end: string
  purpose: string | null
  created_at: string
}

export interface ConflictDetail {
  message: string
  conflicts: Reservation[]
  suggested_start: string | null
  suggested_end: string | null
}

export interface TicketEvent {
  id: number
  user: UserBrief
  old_status: TicketStatus | null
  new_status: TicketStatus | null
  comment: string | null
  created_at: string
}

export interface Ticket {
  id: number
  robot_id: number
  robot_name: string
  robot_responsible_id: number | null
  kind: TicketKind
  title: string
  description: string | null
  status: TicketStatus
  reporter: UserBrief
  assignee: UserBrief | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  events: TicketEvent[]
}

export interface ExperimentLog {
  id: number
  robot_id: number
  robot_name: string
  user: UserBrief
  date: string
  title: string
  description: string | null
  result: ExperimentResult
  created_at: string
}

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : detailMessage(detail))
    this.status = status
    this.detail = detail
  }
}

function detailMessage(detail: unknown): string {
  if (Array.isArray(detail)) return detail.map((d) => d.msg ?? String(d)).join('; ')
  if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message)
  return 'Request failed'
}

const TOKEN_KEY = 'robots.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable; the session simply won't survive a reload */
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null)
    window.dispatchEvent(new Event('robots:logout'))
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, data.detail ?? res.statusText)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

function query(params: Record<string, string | number | boolean | undefined | null>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const api = {
  async login(username: string, password: string) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: new URLSearchParams({ username, password }),
    })
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).detail)
    const { access_token } = await res.json()
    setToken(access_token)
  },
  me: () => request<User>('GET', '/auth/me'),
  authConfig: () => request<AuthConfig>('GET', '/auth/config'),
  /** Full-page redirect to the SSO provider; it comes back to /#token=... */
  ssoLogin: () => window.location.assign('/api/auth/oidc/login'),
  updateMe: (data: Partial<Pick<User, 'display_name' | 'email' | 'language'>>) =>
    request<User>('PATCH', '/auth/me', data),

  users: () => request<User[]>('GET', '/users'),
  createUser: (data: { username: string; display_name: string; email?: string; password: string; role: Role }) =>
    request<User>('POST', '/users', data),
  updateUser: (id: number, data: Partial<User> & { password?: string }) =>
    request<User>('PATCH', `/users/${id}`, data),

  robots: () => request<Robot[]>('GET', '/robots'),
  robot: (id: number) => request<Robot>('GET', `/robots/${id}`),
  createRobot: (data: RobotInput) => request<Robot>('POST', '/robots', data),
  updateRobot: (id: number, data: Partial<RobotInput>) => request<Robot>('PATCH', `/robots/${id}`, data),
  deleteRobot: (id: number) => request<void>('DELETE', `/robots/${id}`),
  createRobotKey: (id: number) => request<{ robot_id: number; api_key: string }>('POST', `/robots/${id}/api-key`),
  revokeRobotKey: (id: number) => request<void>('DELETE', `/robots/${id}/api-key`),
  stats: (days: number) => request<Stats>('GET', `/stats?days=${days}`),

  reservations: (params: { robot_id?: number; user_id?: number; start?: string; end?: string } = {}) =>
    request<Reservation[]>('GET', `/reservations${query(params)}`),
  createReservation: (data: { robot_id: number; start: string; end: string; purpose?: string }) =>
    request<Reservation>('POST', '/reservations', data),
  updateReservation: (id: number, data: { start?: string; end?: string; purpose?: string }) =>
    request<Reservation>('PATCH', `/reservations/${id}`, data),
  deleteReservation: (id: number) => request<void>('DELETE', `/reservations/${id}`),

  tickets: (params: { robot_id?: number; status?: TicketStatus; open_only?: boolean } = {}) =>
    request<Ticket[]>('GET', `/tickets${query(params)}`),
  createTicket: (data: {
    robot_id: number
    kind: TicketKind
    title: string
    description?: string
    mark_robot_defect?: boolean
  }) => request<Ticket>('POST', '/tickets', data),
  updateTicket: (id: number, data: { status?: TicketStatus; assignee_id?: number | null; comment?: string }) =>
    request<Ticket>('PATCH', `/tickets/${id}`, data),

  logs: (params: { robot_id?: number; user_id?: number } = {}) =>
    request<ExperimentLog[]>('GET', `/logs${query(params)}`),
  createLog: (data: { robot_id: number; date: string; title: string; description?: string; result: ExperimentResult }) =>
    request<ExperimentLog>('POST', '/logs', data),
  deleteLog: (id: number) => request<void>('DELETE', `/logs/${id}`),
}

export interface RobotInput {
  name: string
  type: string
  location: string
  responsible_user_id: number | null
  documentation_url: string | null
  description: string | null
  status: RobotStatus
}
