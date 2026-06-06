import { Modal } from 'react-native'

import { AuthProfileLoadingScreen } from '../components/auth-profile-loading-screen'
import { useApp } from '../lib/app-provider'

/** Pantalla de balón encima de toda la app (OAuth / hidratación de perfil). */
export function ProfileHydratingOverlay() {
  const { profileHydrating, profileLoadingMessage } = useApp()

  return (
    <Modal
      visible={profileHydrating}
      animationType="fade"
      statusBarTranslucent
      presentationStyle="fullScreen"
    >
      <AuthProfileLoadingScreen message={profileLoadingMessage} />
    </Modal>
  )
}
