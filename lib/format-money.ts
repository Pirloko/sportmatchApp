/** Formato moneda chilena: $35.000 */
export function formatCLP(amount: number): string {
  const n = Math.round(amount)
  return `$${n.toLocaleString('es-CL')}`
}
