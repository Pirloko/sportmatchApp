import {
  LegalDocumentScreen,
  legalScreenOptions,
} from '../components/legal-document-screen'

export const options = legalScreenOptions('terms')

export default function TermsRoute() {
  return <LegalDocumentScreen kind="terms" />
}
