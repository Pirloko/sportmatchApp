/** Evita dos flujos OAuth simultáneos (sobrescriben code_verifier en AsyncStorage). */
let oauthInFlight = false

export function tryAcquireOAuthLock(): boolean {
  if (oauthInFlight) return false
  oauthInFlight = true
  return true
}

export function releaseOAuthLock(): void {
  oauthInFlight = false
}
