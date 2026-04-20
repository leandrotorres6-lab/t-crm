import './globals.css'
import { ThemeProvider } from '../contexts/ThemeContext'
import { AppProvider } from '../contexts/AppContext'
import AppShell from '../components/layout/AppShell'

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata = {
  title: 'T-CRM — PV Corretora',
  description: 'Sistema de gestão de leads para corretoras de seguros',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'T-CRM',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="T-CRM" />
        <meta name="theme-color" content="#0a1628" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <ThemeProvider>
          <AppProvider>
            <AppShell>
              {children}
            </AppShell>
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
