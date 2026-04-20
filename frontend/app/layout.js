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
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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
