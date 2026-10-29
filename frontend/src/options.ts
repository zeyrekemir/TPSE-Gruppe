import type { Availability, Robot } from './api'

/** Extra lines for an option in Select's pop-up: e.g. a robot's type and place, its availability. */
export type OptionDetail = { sub?: string; status?: Availability }

/** The pop-up details for a list of robots, keyed by option value (the robot's id). */
export function robotDetails(robots: Robot[] | null | undefined): Record<string, OptionDetail> {
  return Object.fromEntries((robots ?? []).map((r) => [String(r.id), { sub: `${r.type} · ${r.location}`, status: r.availability }]))
}
