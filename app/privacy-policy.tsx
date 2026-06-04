import {
  LegalDocumentScreen,
  legalScreenOptions,
} from '../components/legal-document-screen'

export const options = legalScreenOptions('privacy')

export default function PrivacyPolicyRoute() {
  return <LegalDocumentScreen kind="privacy" />
}
