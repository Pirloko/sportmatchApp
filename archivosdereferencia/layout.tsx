import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/providers'
import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Pichanga - Encuentra tu partido',
  description: 'Plataforma de matchmaking para futbol amateur 6 vs 6. Encuentra rivales, jugadores y partidos abiertos en Rancagua.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const themeBootstrap = `(function(){var k='pichanga-theme';function setDark(on){document.documentElement.classList.toggle('dark',on);}try{var s=localStorage.getItem(k);if(s==='light')setDark(false);else if(s==='dark')setDark(true);else if(s==='system')setDark(window.matchMedia('(prefers-color-scheme: dark)').matches);else setDark(true);}catch(_){setDark(true);}})();`

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  )
}
