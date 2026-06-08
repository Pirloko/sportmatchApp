import { BallLoadingIndicator } from './ball-loading-indicator'

type AuthProfileLoadingScreenProps = {
  message?: string
}

export function AuthProfileLoadingScreen({
  message = 'Cargando tu perfil…',
}: AuthProfileLoadingScreenProps) {
  return <BallLoadingIndicator fullScreen size="lg" message={message} />
}
