import { formatCLP } from './format-money'

export type MatchCourtCost = {
  totalCost: number
  perPlayerCost: number
  pricePerHour: number
  durationMinutes: number
  playersCount: number
}

export function computeCourtCostFromHourly(
  pricePerHour: number,
  durationMinutes: number,
  playersNeeded: number
): MatchCourtCost | null {
  if (pricePerHour <= 0 || playersNeeded <= 0) return null
  const hours = durationMinutes / 60
  const totalCost = Math.round(pricePerHour * hours)
  const perPlayerCost = Math.round(totalCost / playersNeeded)
  return {
    totalCost,
    perPlayerCost,
    pricePerHour,
    durationMinutes,
    playersCount: playersNeeded,
  }
}

export function matchCourtCostExplanation(
  organizerName: string,
  cost: MatchCourtCost
): string {
  return `Debes pagar al organizador (${organizerName}) ${formatCLP(cost.perPlayerCost)} para tu parte de la cancha (total ${formatCLP(cost.totalCost)} dividido entre ${cost.playersCount} jugadores).`
}
